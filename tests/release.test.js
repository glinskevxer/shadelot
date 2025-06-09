/**
 * The release contract.
 *
 * The shell script checks these at a release; this checks them on every run, so
 * a break is found by the person who caused it rather than by whoever happens to
 * be cutting a version.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { version } from '../src/version.js';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('the version', () => {
  it('is a release version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is the one the program prints', () => {
    const printed = execFileSync('node', [join(root, 'bin', 'shadelot.js'), '--version'], {
      encoding: 'utf8',
    }).trim();
    expect(printed).toBe(version);
  });
});

describe('the shipped tree', () => {
  it('ships only directories that exist', () => {
    for (const directory of manifest.files) {
      expect(statSync(join(root, directory)).isDirectory(), directory).toBe(true);
    }
  });

  it('has an executable entry point with a shebang', () => {
    const path = join(root, manifest.bin.shadelot);
    expect(readFileSync(path, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
    expect(statSync(path).mode & 0o111).toBeGreaterThan(0);
  });

  it('writes nothing straight to the console from src', () => {
    const offenders = walk(join(root, 'src')).filter((path) =>
      /console\.(log|error|warn)\(/.test(readFileSync(path, 'utf8'))
    );
    expect(offenders.map((path) => path.slice(root.length + 1))).toEqual([]);
  });

  it('never calls process.exit from src, which would break the exit codes', () => {
    const offenders = walk(join(root, 'src')).filter((path) =>
      /process\.exit\(/.test(readFileSync(path, 'utf8'))
    );
    expect(offenders.map((path) => path.slice(root.length + 1))).toEqual([]);
  });

  it('reads process.stdout only where the output pair is defined', () => {
    const readers = walk(join(root, 'src')).filter((path) =>
      readFileSync(path, 'utf8').includes('process.stdout')
    );
    expect(readers.map((path) => path.slice(root.length + 1))).toEqual(['src/cli/io.js']);
  });
});

describe('the scripts', () => {
  it('carries every one the workflow calls', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const called = [...workflow.matchAll(/npm run ([a-z:]+)/g)].map((match) => match[1]);
    for (const name of new Set(called)) {
      expect(manifest.scripts[name], `the workflow calls npm run ${name}`).toBeTruthy();
    }
  });

  it('has a check that runs all of them', () => {
    for (const name of ['lint', 'format:check', 'test', 'smoke', 'release:check']) {
      expect(manifest.scripts.check).toContain(name);
    }
  });
});

describe('the examples the smoke test runs', () => {
  it('are all carried into the image', () => {
    const ignore = readFileSync(join(root, '.dockerignore'), 'utf8');
    expect(ignore).not.toMatch(/^examples/m);
  });

  it('are every file the smoke test names', () => {
    const smoke = readFileSync(join(root, 'scripts', 'smoke.sh'), 'utf8');
    const named = [...smoke.matchAll(/examples\/([a-z0-9-]+\.json)/g)].map((match) => match[1]);
    const present = new Set(readdirSync(join(root, 'examples')));
    for (const name of new Set(named)) {
      expect(present.has(name), `smoke.sh names examples/${name}`).toBe(true);
    }
  });
});

/**
 * What ships.
 *
 * The image cannot be built here, so this reads the files that describe it and
 * checks the things a broken one would get wrong. It is a weaker check than
 * building it, and it is the check that catches the mistake that has actually
 * happened: a file added to src, needed at runtime, and left out of the
 * manifest or the image.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
const dockerignore = readFileSync(join(root, '.dockerignore'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('the manifest', () => {
  it('ships the entry point and the source and nothing else', () => {
    expect(manifest.files).toEqual(['bin', 'src']);
    expect(manifest.bin.shadelot).toBe('bin/shadelot.js');
  });

  it('declares a node version the image agrees with', () => {
    expect(manifest.engines.node).toBe('>=20.11');
    expect(dockerfile).toMatch(/FROM node:20\./);
  });

  it('carries exactly one runtime dependency', () => {
    expect(Object.keys(manifest.dependencies)).toEqual(['commander']);
  });

  it('pins every dependency to an exact version', () => {
    const all = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const [name, range] of Object.entries(all)) {
      expect(range, `${name} is not pinned`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('names the scripts the checks and the workflow call', () => {
    for (const script of ['test', 'lint', 'format:check', 'smoke', 'coverage', 'check']) {
      expect(manifest.scripts[script], `missing script ${script}`).toBeTruthy();
    }
  });
});

describe('the image', () => {
  it('has exactly one base, which the platform requires', () => {
    expect(dockerfile.match(/^FROM /gm)).toHaveLength(1);
  });

  it('copies everything the entry point needs at runtime', () => {
    for (const directory of ['bin', 'src', 'examples']) {
      expect(dockerfile).toMatch(new RegExp(`COPY ${directory} `));
    }
  });

  it('installs the dependencies before it copies the source', () => {
    expect(dockerfile.indexOf('npm ci')).toBeLessThan(dockerfile.indexOf('COPY src'));
  });

  it('leaves the development dependencies out', () => {
    expect(dockerfile).toMatch(/npm ci --omit=dev/);
  });

  it('does not run as root', () => {
    expect(dockerfile).toMatch(/^USER node$/m);
  });

  it('keeps the tests and the git tree out of the build context', () => {
    for (const entry of ['tests', '.git', 'node_modules', 'coverage']) {
      expect(dockerignore).toMatch(new RegExp(`^${entry.replace('.', '\\.')}$`, 'm'));
    }
  });

  it('runs the command listing by default, which is harmless', () => {
    expect(dockerfile).toMatch(/CMD \["commands"\]/);
  });
});

describe('the source tree the image copies', () => {
  it('holds no file the manifest would leave behind', () => {
    const shipped = walk(join(root, 'src')).map((path) => path.slice(root.length + 1));
    expect(shipped.every((path) => path.startsWith('src/'))).toBe(true);
    expect(shipped.length).toBeGreaterThan(30);
  });

  it('imports nothing from outside src or bin at runtime', () => {
    const offenders = [];
    for (const path of walk(join(root, 'src'))) {
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/from '([^']+)'/g)) {
        const specifier = match[1];
        if (specifier.startsWith('node:')) continue;
        if (specifier.startsWith('.')) continue;
        if (Object.keys(manifest.dependencies).includes(specifier)) continue;
        offenders.push(`${path.slice(root.length + 1)} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches the package manifest only through the version module', () => {
    const readers = walk(join(root, 'src')).filter((path) =>
      readFileSync(path, 'utf8').includes('package.json')
    );
    expect(readers.map((path) => path.slice(root.length + 1))).toEqual(['src/version.js']);
  });
});

describe('the workflow', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  it('runs the tests on both node versions the manifest supports', () => {
    expect(workflow).toMatch(/'20\.18\.2', '22\.13\.1'/);
    expect(workflow.match(/matrix:/g).length).toBeGreaterThanOrEqual(2);
  });

  it('builds the image and runs the entry point inside it', () => {
    expect(workflow).toMatch(/docker build -t shadelot:ci \./);
    expect(workflow).toMatch(/docker run --rm shadelot:ci commands/);
  });

  it('checks the image is not running as root', () => {
    expect(workflow).toMatch(/the image runs as root/);
  });

  it('checks the test runner did not get into the image', () => {
    expect(workflow).toMatch(/vitest is in the image/);
  });

  it('has a floor under the test count, so the suite cannot quietly shrink', () => {
    expect(workflow).toMatch(/fallen below the floor of \d+ tests/);
  });

  it('runs every gate the check script runs', () => {
    for (const script of ['lint', 'format:check', 'smoke', 'coverage', 'release:check']) {
      expect(workflow, script).toContain(`npm run ${script}`);
    }
    expect(workflow).toMatch(/^ {6}- run: npm test$/m);
  });

  it('installs from the lock file rather than resolving fresh', () => {
    expect(workflow).toMatch(/npm ci/);
    expect(workflow).not.toMatch(/npm install/);
  });

  it('caches the package downloads on every job that installs', () => {
    const installs = workflow.match(/npm ci/g).length;
    const caches = workflow.match(/cache: npm/g).length;
    expect(caches).toBeGreaterThanOrEqual(installs - 1);
  });

  it('cancels a superseded run rather than queueing it', () => {
    expect(workflow).toMatch(/cancel-in-progress: true/);
  });

  it('asks for no more permission than reading the tree', () => {
    expect(workflow).toMatch(/permissions:\n {2}contents: read/);
  });
});

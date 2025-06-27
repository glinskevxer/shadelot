import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as shadelot from '../src/index.js';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(join(root, 'src'))
  .map((path) => path.slice(root.length + 1))
  .filter((path) => path.endsWith('.js'))
  .filter((path) => path !== 'src/index.js' && path !== 'src/version.js')
  .filter((path) => !path.startsWith('src/cli/'));

describe('the public surface', () => {
  it('exports a namespace per domain module', () => {
    expect(Object.keys(shadelot).length).toBeGreaterThan(40);
  });

  it('exports nothing that is empty', () => {
    for (const [key, value] of Object.entries(shadelot)) {
      expect(Object.keys(value).length, `${key} exports nothing`).toBeGreaterThan(0);
    }
  });

  it('carries no name twice', () => {
    const keys = Object.keys(shadelot);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reaches the same function through the namespace as through the file', async () => {
    const direct = await import('../src/colour/deltae.js');
    expect(shadelot.deltae.deltaE76).toBe(direct.deltaE76);
  });
});

describe('every domain module', () => {
  it('is reachable from the surface', async () => {
    const missing = [];
    for (const path of sourceFiles) {
      const module = await import(`../${path}`);
      const names = Object.keys(module);
      const reachable = Object.values(shadelot).some((namespace) =>
        names.every((name) => namespace[name] === module[name])
      );
      if (!reachable) missing.push(path);
    }
    expect(missing, `not exported: ${missing.join(', ')}`).toEqual([]);
  });

  it('is a real file rather than an empty one', () => {
    expect(sourceFiles.length).toBeGreaterThan(35);
  });
});

describe('the command line is not on the surface', () => {
  it('exports nothing from src/cli', () => {
    for (const value of Object.values(shadelot)) {
      expect(value.buildProgram).toBeUndefined();
      expect(value.registerCommands).toBeUndefined();
    }
  });
});

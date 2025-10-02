/**
 * The house rules.
 *
 * Everything here is a rule this codebase keeps and would rather not break
 * quietly: how a module opens, what a guard message looks like, where a magic
 * number is allowed to live, and that no two modules define the same public
 * name. None of it is style for its own sake. Each one is a rule that was
 * broken once and cost an afternoon.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(join(root, 'src'))
  .filter((path) => path.endsWith('.js'))
  .map((path) => ({ path: path.slice(root.length + 1), text: readFileSync(path, 'utf8') }));

const tests = walk(join(root, 'tests'))
  .filter((path) => path.endsWith('.test.js'))
  .map((path) => ({ path: path.slice(root.length + 1), text: readFileSync(path, 'utf8') }));

describe('every source file', () => {
  it('there are enough of them to be worth checking', () => {
    expect(sources.length).toBeGreaterThan(60);
  });

  it.each(sources)('$path opens with a block comment saying what it is for', ({ text }) => {
    expect(text.startsWith('/**')).toBe(true);
    const opening = text.slice(0, text.indexOf('*/'));
    expect(opening.split('\n').length).toBeGreaterThan(3);
  });

  it.each(sources)('$path exports something', ({ text }) => {
    expect(text).toMatch(/^export /m);
  });

  it.each(sources)('$path leaves no debugging behind', ({ text }) => {
    expect(text).not.toMatch(/console\.(log|debug)\(/);
    expect(text).not.toMatch(/\bdebugger\b/);
    expect(text).not.toMatch(/\bTODO\b|\bFIXME\b|\bXXX\b/);
  });

  it.each(sources)('$path ends in a single newline', ({ text }) => {
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});

describe('every test file', () => {
  it.each(tests)('$path names what it is testing rather than the file', ({ text }) => {
    expect(text).toMatch(/describe\(/);
    const firstDescribe = /describe\('([^']+)'/.exec(text);
    if (!firstDescribe) return;
    expect(firstDescribe[1]).not.toMatch(/\.js$/);
  });

  it.each(tests)('$path asserts something in every test it declares', ({ text }) => {
    const declared = (text.match(/\bit(?:\.each\([^)]*\))?\(/g) ?? []).length;
    const asserted = (text.match(/expect\(/g) ?? []).length;
    expect(asserted).toBeGreaterThanOrEqual(declared);
  });

  it.each(tests)('$path leaves nothing skipped', ({ text }) => {
    expect(text).not.toMatch(/\b(it|describe|test)\.(skip|only|todo)\(/);
  });
});

describe('the guard messages', () => {
  it('never end in a full stop, because they are joined into sentences', () => {
    for (const { path, text } of sources) {
      for (const match of text.matchAll(/new FieldError\('[^']+', '([^']+)'/g)) {
        expect(match[1].endsWith('.'), `${path}: ${match[1]}`).toBe(false);
      }
    }
  });

  it('start with a verb rather than the field name, which the guard adds', () => {
    for (const { path, text } of sources) {
      for (const match of text.matchAll(/new FieldError\('([^']+)', '([^']+)'/g)) {
        expect(match[2].startsWith(match[1]), `${path}: ${match[2]}`).toBe(false);
      }
    }
  });
});

describe('the public names', () => {
  it('no two modules export the same one, which would make an import ambiguous', () => {
    const owners = new Map();
    const clashes = [];
    for (const { path, text } of sources) {
      if (path === 'src/index.js') continue;
      for (const match of text.matchAll(/^export (?:function|const|class) (\w+)/gm)) {
        const name = match[1];
        if (owners.has(name) && owners.get(name) !== path) {
          clashes.push(`${name} in ${owners.get(name)} and ${path}`);
        }
        owners.set(name, path);
      }
    }
    // A handful are deliberate: a make, a create and a require named for their
    // own module read better than a name qualified twice. Anything past that is
    // a collision waiting to confuse an import.
    expect(clashes.length, clashes.join('; ')).toBeLessThanOrEqual(13);
  });
});

describe('the frozen constants', () => {
  it('are frozen wherever a module exports a table', () => {
    for (const { path, text } of sources) {
      for (const match of text.matchAll(/^export const ([A-Z_]+) = (\{|\[)/gm)) {
        expect(false, `${path}: ${match[1]} is exported unfrozen`).toBe(true);
      }
    }
  });
});

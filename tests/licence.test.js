/**
 * The licence, and the clock.
 *
 * Two things that are only ever noticed when they are wrong. The manifest
 * claimed a licence with no file behind it for the whole of this project's
 * life, which is the sort of gap that is invisible until somebody asks.
 *
 * The clock checks are here for the same reason: nothing in this program may
 * read the system clock except through a parameter a caller can pin, and the
 * only way to keep that true is to check it. A test suite that passes today
 * and fails on the first of a month is the worst kind of red.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const licence = readFileSync(join(root, 'LICENSE'), 'utf8');

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('the licence', () => {
  it('is the one the manifest claims', () => {
    expect(manifest.license).toBe('MIT');
    expect(licence).toMatch(/^MIT License/);
  });

  it('carries a copyright line with a holder on it', () => {
    const line = licence.split('\n').find((entry) => entry.startsWith('Copyright'));
    expect(line).toMatch(/Copyright \(c\) \d{4} \S+/);
  });

  it('carries the whole grant, not a summary of it', () => {
    for (const clause of [
      'without restriction',
      'WITHOUT WARRANTY OF ANY KIND',
      'shall be included in all',
    ]) {
      expect(licence, clause).toContain(clause);
    }
  });

  it('is dated no later than the first commit', () => {
    const year = Number(/Copyright \(c\) (\d{4})/.exec(licence)[1]);
    expect(year).toBeLessThanOrEqual(new Date().getUTCFullYear());
    expect(year).toBeGreaterThan(2000);
  });
});

describe('the clock', () => {
  const sources = walk(join(root, 'src'))
    .filter((path) => path.endsWith('.js'))
    .map((path) => ({ path: path.slice(root.length + 1), text: readFileSync(path, 'utf8') }));

  it('is read only through a parameter a caller can pin', () => {
    const offenders = [];
    for (const { path, text } of sources) {
      for (const line of text.split('\n')) {
        if (!/new Date\(\)|Date\.now\(\)/.test(line)) continue;
        // The only acceptable shape is a default for an injected parameter.
        if (/=\s*\(\)\s*=>\s*new Date\(\)/.test(line)) continue;
        offenders.push(`${path}: ${line.trim()}`);
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([]);
  });

  it('is never read by a test at all', () => {
    const offenders = walk(join(root, 'tests'))
      .filter((path) => path.endsWith('.test.js'))
      .filter((path) => /new Date\(\)|Date\.now\(\)/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1))
      .filter((path) => path !== 'tests/licence.test.js');
    expect(offenders, offenders.join('; ')).toEqual([]);
  });

  it('builds every other date from an explicit string, anchored to UTC', () => {
    // The argument can span a template literal, so this reads the line rather
    // than trying to balance the brackets: every line that builds a date either
    // takes no argument at all (the injectable default above) or anchors the
    // string it builds to midnight UTC.
    for (const { path, text } of sources) {
      for (const line of text.split('\n')) {
        if (!line.includes('new Date(')) continue;
        if (line.includes('new Date()')) continue;
        expect(line.includes('T00:00:00Z'), `${path}: ${line.trim()}`).toBe(true);
      }
    }
  });

  it('never uses a local time getter, which would move with the timezone', () => {
    const local = /\.get(FullYear|Month|Date|Hours|Minutes|Seconds)\(/;
    for (const { path, text } of sources) {
      expect(local.test(text), `${path} reads a local time component`).toBe(false);
    }
  });
});

/**
 * The walkthrough.
 *
 * The document in docs/ names modules and commands. Both move, and a document
 * naming a module that no longer exists is worse than no document. This checks
 * every name in it against the tree and the parser.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../src/cli/io.js';
import { buildProgram, describeCommands } from '../src/cli/program.js';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const docs = readdirSync(join(root, 'docs')).filter((name) => name.endsWith('.md'));
const commands = describeCommands(buildProgram({ out: createOutput(), err: createOutput() })).map(
  (row) => row.command
);

describe('the docs folder', () => {
  it('holds at least one walkthrough', () => {
    expect(docs.length).toBeGreaterThan(0);
  });
});

describe.each(docs)('%s', (name) => {
  const text = readFileSync(join(root, 'docs', name), 'utf8');

  it('names only source files that are there', () => {
    const named = [...text.matchAll(/`(src\/[a-z/]+\.js)`/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(4);
    for (const path of new Set(named)) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
  });

  it('names only commands the program carries', () => {
    const named = [...text.matchAll(/`shadelot ([a-z-]+)/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(6);
    for (const command of new Set(named)) {
      expect(commands, command).toContain(command);
    }
  });

  it('starts with a heading', () => {
    expect(text.startsWith('# ')).toBe(true);
  });

  it('has a heading for every numbered step, in order', () => {
    const steps = [...text.matchAll(/^## (\d+)\./gm)].map((match) => Number(match[1]));
    if (steps.length === 0) return;
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps[0]).toBe(1);
  });

  it('leaves no line ending in whitespace', () => {
    for (const [index, line] of text.split('\n').entries()) {
      expect(line, `line ${index + 1}`).toBe(line.trimEnd());
    }
  });
});

describe('the readme points at the docs', () => {
  it('or the docs point at the readme, so neither is orphaned', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const linked = docs.some((name) => readme.includes(`docs/${name}`));
    expect(linked, 'no document in docs/ is linked from the readme').toBe(true);
  });
});

describe('what the walkthrough claims about the order of things', () => {
  const text = readFileSync(join(root, 'docs', 'a-batch-end-to-end.md'), 'utf8');

  it('puts the arrival before the card and the card before the machine', () => {
    expect(text.indexOf('The cloth arrives')).toBeLessThan(text.indexOf('The card is written'));
    expect(text.indexOf('The card is written')).toBeLessThan(text.indexOf('It goes on a machine'));
  });

  it('puts the judging after the running and the paying after both', () => {
    expect(text.indexOf('It runs')).toBeLessThan(text.indexOf('It is judged'));
    expect(text.indexOf('It is judged')).toBeLessThan(text.indexOf('It is paid for'));
  });

  it('names the command a reader would reach for at each step', async () => {
    const { readdirSync: read } = await import('node:fs');
    const commandFiles = read(join(root, 'src', 'cli', 'commands')).filter(
      (name) => name.endsWith('.js') && name !== 'index.js'
    );
    const named = new Set([...text.matchAll(/`shadelot ([a-z-]+)/g)].map((match) => match[1]));
    expect(named.size).toBeGreaterThanOrEqual(Math.floor(commandFiles.length / 2));
  });

  it('explains why the card is scaled before it is rounded', () => {
    expect(text).toMatch(/Rounding a percentage means/);
  });

  it('explains why an order is judged twice', () => {
    expect(text).toMatch(/first accepted one/);
  });

  it('says the trail is append only', () => {
    expect(text).toMatch(/append only/);
  });
});

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
    expect(named.length).toBeGreaterThan(0);
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

describe('the troubleshooting guide', () => {
  const text = readFileSync(join(root, 'docs', 'when-a-batch-goes-wrong.md'), 'utf8');

  it('covers the four things that happen', () => {
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings.length).toBeGreaterThanOrEqual(5);
  });

  it('starts with the shade problem, which is the common one', () => {
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings[0]).toMatch(/off shade/);
  });

  it('ends with what not to do', () => {
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings.at(-1)).toMatch(/not to do/);
  });

  it('names only commands the program carries', () => {
    const named = [...text.matchAll(/`shadelot ([a-z-]+)/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(5);
    for (const command of new Set(named)) {
      expect(commands, command).toContain(command);
    }
  });

  it('names only source files that are there', () => {
    for (const match of text.matchAll(/`(src\/[a-z/]+\.js)`/g)) {
      expect(existsSync(join(root, match[1])), match[1]).toBe(true);
    }
  });

  it('tells the reader not to widen a tolerance to pass a batch', () => {
    expect(text).toMatch(/not widen a tolerance/);
  });
});

describe('the two guides together', () => {
  const walkthrough = readFileSync(join(root, 'docs', 'a-batch-end-to-end.md'), 'utf8');
  const troubleshooting = readFileSync(join(root, 'docs', 'when-a-batch-goes-wrong.md'), 'utf8');

  it('do not repeat each other whole', () => {
    const shared = walkthrough
      .split('\n')
      .filter((line) => line.length > 60 && troubleshooting.includes(line));
    expect(shared).toEqual([]);
  });

  it('mention most of the commands between them', () => {
    const named = new Set(
      [...`${walkthrough}\n${troubleshooting}`.matchAll(/`shadelot ([a-z-]+)/g)].map(
        (match) => match[1]
      )
    );
    expect(named.size / commands.length).toBeGreaterThan(0.6);
  });

  it('name every command they mention correctly', () => {
    for (const text of [walkthrough, troubleshooting]) {
      for (const match of text.matchAll(/`shadelot ([a-z-]+)/g)) {
        expect(commands, match[1]).toContain(match[1]);
      }
    }
  });

  it('are both linked from the readme', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toContain('docs/a-batch-end-to-end.md');
    expect(readme).toContain('docs/when-a-batch-goes-wrong.md');
  });

  it('are both plain markdown with no trailing whitespace', () => {
    for (const text of [walkthrough, troubleshooting]) {
      for (const line of text.split('\n')) {
        expect(line).toBe(line.trimEnd());
      }
    }
  });

  it('do not promise a command line the readme does not show', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    for (const match of troubleshooting.matchAll(/`shadelot ([a-z-]+)( --[a-z-]+)?`/g)) {
      expect(readme.includes(match[1]) || walkthrough.includes(match[1]), match[1]).toBe(true);
    }
  });
});

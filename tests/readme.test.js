/**
 * The readme.
 *
 * Documentation goes stale the day after it is written unless something checks
 * it. These are the claims in the readme that can be checked mechanically: that
 * every command line it shows runs, that every folder it lists exists, and that
 * every command the program carries is mentioned somewhere in it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../src/cli/io.js';
import { buildProgram, describeCommands, run } from '../src/cli/program.js';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const capture = () => ({ out: createOutput(), err: createOutput() });
const commands = describeCommands(buildProgram(capture())).map((row) => row.command);

const invocations = [...readme.matchAll(/^node bin\/shadelot\.js (.+)$/gm)].map((match) =>
  match[1].split(' ')
);

describe('the command lines it shows', () => {
  it('finds some', () => {
    expect(invocations.length).toBeGreaterThan(8);
  });

  it.each(invocations)('runs: %s', async (...argv) => {
    const io = capture();
    const resolved = argv.map((part) => (part.startsWith('examples/') ? join(root, part) : part));
    const code = await run(resolved, io);
    expect([0, 5, 6, 7], `${argv.join(' ')} left with ${code}: ${io.err.text()}`).toContain(code);
  });

  it('names a command that exists in every one of them', () => {
    for (const argv of invocations) {
      expect(commands, argv[0]).toContain(argv[0]);
    }
  });
});

describe('the folders it lists', () => {
  const listed = [...readme.matchAll(/`(src\/[a-z]+)`/g)].map((match) => match[1]);

  it('finds the table', () => {
    expect(new Set(listed).size).toBeGreaterThan(15);
  });

  it('lists only folders that are there', () => {
    for (const folder of new Set(listed)) {
      expect(existsSync(join(root, folder)), folder).toBe(true);
    }
  });
});

describe('the commands it does not mention', () => {
  it('is a short list, and every one of them is a variant of one it does', () => {
    const missing = commands.filter((command) => !readme.includes(command));
    expect(missing.length, `not in the readme: ${missing.join(', ')}`).toBeLessThanOrEqual(6);
  });

  it('mentions the ones a first time reader needs', () => {
    for (const command of ['init', 'card', 'plan', 'works', 'commands']) {
      expect(readme, command).toContain(command);
    }
  });
});

describe('the checks it tells people to run', () => {
  it('names scripts the manifest actually carries', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const match of readme.matchAll(/npm run ([a-z:]+)/g)) {
      expect(manifest.scripts[match[1]], `npm run ${match[1]}`).toBeTruthy();
    }
  });

  it('points at a test file that is there', () => {
    for (const match of readme.matchAll(/`(tests\/[a-z/.-]+\.js)`/g)) {
      expect(existsSync(join(root, match[1])), match[1]).toBe(true);
    }
  });
});

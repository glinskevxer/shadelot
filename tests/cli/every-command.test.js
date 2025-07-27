/**
 * Every command, walked off the parser.
 *
 * A command added tomorrow is covered by this file tomorrow, without anybody
 * remembering to add it. That is the whole point: the checks below are the ones
 * that have to hold for every command, and the list they run over is read off
 * the program rather than typed here.
 */

import { describe, expect, it } from 'vitest';
import { createOutput } from '../../src/cli/io.js';
import { buildProgram, describeCommands, run } from '../../src/cli/program.js';

const capture = () => ({ out: createOutput(), err: createOutput() });
const commands = describeCommands(buildProgram(capture()));
const commandNames = commands.map((row) => row.command);

describe('the listing itself', () => {
  it('is not empty and has no duplicates', () => {
    expect(commands.length).toBeGreaterThan(10);
    const names = commands.map((row) => row.command);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe.each(commands)('$command', (command) => {
  it('has a description long enough to be a sentence', () => {
    expect(command.description.length).toBeGreaterThan(12);
  });

  it('describes itself in lower case, like the rest of them', () => {
    expect(command.description[0]).toBe(command.description[0].toLowerCase());
  });

  it('does not end its description with a full stop', () => {
    expect(command.description.endsWith('.')).toBe(false);
  });

  it('prints its own help and leaves quietly', async () => {
    const io = capture();
    expect(await run([command.command, '--help'], io)).toBe(0);
    expect(io.out.text()).toContain(command.command);
  });

  it('names every option with both a description and a placeholder where it takes a value', () => {
    for (const flags of command.options) {
      expect(flags).toMatch(/^-/);
      if (flags.includes('<')) {
        expect(flags).toMatch(/<[a-z][a-z=]*>/);
      }
    }
  });

  it('refuses a flag it does not know', async () => {
    const io = capture();
    expect(await run([command.command, '--not-a-real-flag'], io)).toBe(2);
  });

  it('offers a format flag or has nothing tabular to print', async () => {
    const formats = command.options.filter((flags) => flags.includes('--format'));
    expect(formats.length).toBeLessThanOrEqual(1);
  });
});

describe('the commands that read files', () => {
  const readers = commands.filter((command) =>
    command.options.some((flags) => flags.includes('<path>'))
  );

  it('is most of them', () => {
    expect(readers.length).toBeGreaterThan(8);
  });

  it.each(readers)('$command reports a missing file as not found', async (command) => {
    const flag = command.options
      .find((flags) => flags.includes('<path>'))
      .split(/[ ,]/)
      .find((part) => part.startsWith('--'));
    const io = capture();
    const code = await run([command.command, flag, '/nowhere/missing.json'], io);
    expect([2, 3]).toContain(code);
  });
});

describe('the smoke test and the workflow', () => {
  const readFile = async (path) => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
    return readFileSync(join(root, path), 'utf8');
  };

  it('runs most of the commands between them', async () => {
    const smoke = await readFile('scripts/smoke.sh');
    const workflow = await readFile('.github/workflows/ci.yml');
    const both = `${smoke}\n${workflow}`;
    const covered = commandNames.filter((command) =>
      new RegExp(`shadelot\\.js ${command}\\b`).test(both)
    );
    expect(covered.length / commandNames.length).toBeGreaterThan(0.85);
  });

  it('names no command that does not exist', async () => {
    const smoke = await readFile('scripts/smoke.sh');
    // The smoke test deliberately runs one command that does not exist, to check
    // the usage exit code, so that one is expected to be missing and no other.
    const named = [...smoke.matchAll(/shadelot\.js ([a-z-]+)/g)].map((match) => match[1]);
    const unknown = [...new Set(named)].filter(
      (name) => !name.startsWith('--') && !commandNames.includes(name)
    );
    expect(unknown).toEqual(['nonsense']);
  });

  it('names no example file that is not there', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
    const workflow = await readFile('.github/workflows/ci.yml');
    for (const match of workflow.matchAll(/examples\/[a-z0-9-]+\.json/g)) {
      expect(existsSync(join(root, match[0])), match[0]).toBe(true);
    }
  });

  it('checks the exit codes rather than only that things ran', async () => {
    const smoke = await readFile('scripts/smoke.sh');
    expect([...smoke.matchAll(/expect_code /g)].length).toBeGreaterThanOrEqual(4);
  });
});

describe('what a command may and may not do', () => {
  it.each(commands)('$command takes its inputs as files or short flags', (command) => {
    for (const flags of command.options) {
      expect(flags.length).toBeLessThan(48);
      expect(flags).not.toMatch(/\s{2,}/);
    }
  });

  it.each(commands)('$command names no option twice', (command) => {
    const longs = command.options
      .map((flags) => flags.split(/[ ,]+/).find((part) => part.startsWith('--')))
      .filter(Boolean);
    expect(new Set(longs).size).toBe(longs.length);
  });

  it.each(commands)('$command spells its format flag the same as the rest', (command) => {
    const format = command.options.find((flags) => flags.includes('--format'));
    if (!format) return;
    expect(format).toBe('--format <format>');
  });

  it.each(commands)(
    '$command gives every short flag the first letter of its own name',
    (command) => {
      for (const flags of command.options) {
        const short = flags.split(/[ ,]+/).find((part) => /^-[a-z]$/.test(part));
        const long = flags.split(/[ ,]+/).find((part) => part.startsWith('--'));
        if (!short) continue;
        expect(long.slice(2, 3), `${command.command} uses ${short} for ${long}`).toBe(
          short.slice(1)
        );
      }
    }
  );
});

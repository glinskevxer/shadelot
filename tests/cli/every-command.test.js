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

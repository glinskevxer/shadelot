/**
 * What happens when everything is wrong.
 *
 * Every command has a happy path somebody tested and a set of failure paths
 * nobody did, and the failure paths are where a works meets the program at two
 * in the morning. This drives each one at a file that is missing, a file that is
 * not json, a file that is the wrong shape and a file that is the right shape
 * with rubbish in it, and checks that it never crashes and always says which.
 */

import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXIT } from '../../src/cli/exit.js';
import { createOutput } from '../../src/cli/io.js';
import { buildProgram, describeCommands, run } from '../../src/cli/program.js';

const capture = () => ({ out: createOutput(), err: createOutput() });
const commands = describeCommands(buildProgram(capture()));

const readers = commands
  .map((command) => ({
    command: command.command,
    flag: command.options
      .filter((flags) => flags.includes('<path>'))
      .map((flags) => flags.split(/[ ,]+/).find((part) => part.startsWith('--')))
      .find(Boolean),
    required: command.options.filter((flags) => flags.includes('<path>')).length,
  }))
  .filter((row) => row.flag)
  // init is pointed at a file that is meant not to exist, so a missing file is
  // its happy path rather than a failure. It has its own tests.
  .filter((row) => row.command !== 'init');

let directory;
let missing;
let notJson;
let wrongShape;
let emptyArray;
let aDirectory;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-failures-'));
  missing = join(directory, 'not-there.json');
  notJson = join(directory, 'broken.json');
  wrongShape = join(directory, 'wrong.json');
  emptyArray = join(directory, 'empty.json');
  aDirectory = join(directory, 'folder');
  await writeFile(notJson, '{ this is not json', 'utf8');
  await writeFile(wrongShape, '"a string"', 'utf8');
  await writeFile(emptyArray, '[]', 'utf8');
  await mkdir(aDirectory);
});

const ACCEPTABLE = [EXIT.usage, EXIT.notFound, EXIT.invalidData];

describe.each(readers)('$command', ({ command, flag }) => {
  it('reports a missing file rather than throwing', async () => {
    const io = capture();
    const code = await run([command, flag, missing], io);
    expect(ACCEPTABLE, `${command} left with ${code}`).toContain(code);
    expect(io.err.text().length).toBeGreaterThan(0);
  });

  it('reports a file that is not json', async () => {
    const io = capture();
    const code = await run([command, flag, notJson], io);
    expect(ACCEPTABLE).toContain(code);
  });

  it('reports a file holding the wrong sort of thing', async () => {
    const io = capture();
    const code = await run([command, flag, wrongShape], io);
    expect(ACCEPTABLE).toContain(code);
  });

  it('reports an empty list where it wanted rows', async () => {
    const io = capture();
    const code = await run([command, flag, emptyArray], io);
    expect(ACCEPTABLE).toContain(code);
  });

  it('reports a directory where it wanted a file', async () => {
    const io = capture();
    const code = await run([command, flag, aDirectory], io);
    expect(ACCEPTABLE).toContain(code);
  });

  it('never leaves with the catch all code, which would mean it was surprised', async () => {
    for (const bad of [missing, notJson, wrongShape, emptyArray, aDirectory]) {
      const io = capture();
      const code = await run([command, flag, bad], io);
      expect(code, `${command} on ${bad}: ${io.err.text()}`).not.toBe(EXIT.fault);
    }
  });

  it('writes nothing to the output when it fails on the first file it reads', async () => {
    const io = capture();
    await run([command, flag, missing], io);
    expect(io.out.text()).toBe('');
  });

  it('says something a person could act on', async () => {
    const io = capture();
    await run([command, flag, notJson], io);
    const message = io.err.text();
    expect(message).not.toMatch(/undefined|\[object Object\]|NaN/);
    expect(message.length).toBeGreaterThan(12);
  });
});

describe('the arguments themselves', () => {
  it.each(commands)('$command refuses a value where it wanted a number', async (command) => {
    const numeric = command.options.find((flags) =>
      /<(kg|count|score|units|owf|value|gpl)>/.test(flags)
    );
    if (!numeric) return;
    const flag = numeric.split(/[ ,]+/).find((part) => part.startsWith('--'));
    const io = capture();
    const code = await run([command.command, flag, 'lots'], io);
    expect([EXIT.usage, EXIT.invalidData, EXIT.notFound]).toContain(code);
  });

  it.each(commands)('$command refuses a format nothing writes', async (command) => {
    if (!command.options.some((flags) => flags.includes('--format'))) return;
    const io = capture();
    const code = await run([command.command, '--format', 'xml'], io);
    expect([EXIT.usage, EXIT.invalidData, EXIT.notFound]).toContain(code);
  });
});

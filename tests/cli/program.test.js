import { describe, expect, it } from 'vitest';
import { createOutput } from '../../src/cli/io.js';
import { buildProgram, describeCommands, run } from '../../src/cli/program.js';
import { registrarCount } from '../../src/cli/commands/index.js';
import { version } from '../../src/version.js';

const capture = () => ({ out: createOutput(), err: createOutput() });

describe('the program', () => {
  it('carries a command for every registrar', () => {
    const program = buildProgram(capture());
    expect(program.commands).toHaveLength(registrarCount());
  });

  it('describes each command off the parser rather than a list', () => {
    const described = describeCommands(buildProgram(capture()));
    expect(described.map((row) => row.command)).toContain('commands');
    for (const row of described) {
      expect(row.description.length).toBeGreaterThan(6);
    }
  });

  it('prints the version and leaves quietly', async () => {
    const io = capture();
    expect(await run(['--version'], io)).toBe(0);
    expect(io.out.text()).toContain(version);
  });

  it('prints help without treating it as a failure', async () => {
    const io = capture();
    expect(await run(['--help'], io)).toBe(0);
    expect(io.out.text()).toMatch(/commission dyehouse/);
  });
});

describe('the listing command', () => {
  it('prints a table by default', async () => {
    const io = capture();
    expect(await run(['commands'], io)).toBe(0);
    expect(io.out.text()).toMatch(/^command/m);
  });

  it('prints json when asked', async () => {
    const io = capture();
    await run(['commands', '--format', 'json'], io);
    const rows = JSON.parse(io.out.text());
    expect(rows.some((row) => row.command === 'commands')).toBe(true);
  });

  it('orders the listing so it does not shuffle between builds', async () => {
    const io = capture();
    await run(['commands', '--format', 'json'], io);
    const names = JSON.parse(io.out.text()).map((row) => row.command);
    expect([...names].sort()).toEqual(names);
  });

  it('refuses a format nothing writes', async () => {
    const io = capture();
    expect(await run(['commands', '--format', 'csv'], io)).toBe(4);
    expect(io.err.text()).toMatch(/format/);
  });
});

describe('when the arguments are wrong', () => {
  it('leaves with the usage code for a command nothing knows', async () => {
    const io = capture();
    expect(await run(['nonsense'], io)).toBe(2);
    expect(io.err.text()).toMatch(/unknown command/i);
  });

  it('leaves with the usage code for a flag nothing knows', async () => {
    const io = capture();
    expect(await run(['commands', '--colour'], io)).toBe(2);
  });
});

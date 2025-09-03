import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const registerPath = fileURLToPath(new URL('../../../examples/standards.json', import.meta.url));
const register = JSON.parse(readFileSync(registerPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-standards-'));
});

const registerFile = async (name, rows) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(rows), 'utf8');
  return path;
};

describe('the standards command', () => {
  it('reports the register against a date it is given', async () => {
    const io = capture();
    const code = await run(['standards', '-s', registerPath, '--today', '2025-05-01'], io);
    expect([0, 5]).toContain(code);
    expect(io.out.text()).toMatch(/reporting on\s+2025-05-01/);
  });

  it('flags the standard that has faded', async () => {
    const io = capture();
    expect(await run(['standards', '-s', registerPath, '--today', '2025-05-01'], io)).toBe(5);
    expect(io.err.text()).toMatch(/S25-0051/);
  });

  it('leaves the one that has held alone', async () => {
    const io = capture();
    await run(['standards', '-s', registerPath, '--today', '2025-05-01', '--format', 'json'], io);
    const rows = JSON.parse(io.out.text()).standards;
    expect(rows.find((row) => row.id === 'S25-0044').state).toBe('good');
  });

  it('marks a retired standard as retired rather than drifted', async () => {
    const io = capture();
    await run(['standards', '-s', registerPath, '--today', '2025-05-01', '--format', 'json'], io);
    const rows = JSON.parse(io.out.text()).standards;
    expect(rows.find((row) => row.id === 'S24-0318').state).toBe('retired');
  });

  it('lists what is due a re-measure and leaves the retired one off it', async () => {
    const io = capture();
    await run(['standards', '-s', registerPath, '--today', '2026-01-01', '--format', 'json'], io);
    const due = JSON.parse(io.out.text()).due.map((row) => row.id);
    expect(due).toContain('S25-0044');
    expect(due).not.toContain('S24-0318');
  });

  it('answers the same way for the same date however often it is run', async () => {
    const first = capture();
    await run(
      ['standards', '-s', registerPath, '--today', '2025-05-01', '--format', 'json'],
      first
    );
    const second = capture();
    await run(
      ['standards', '-s', registerPath, '--today', '2025-05-01', '--format', 'json'],
      second
    );
    expect(first.out.text()).toBe(second.out.text());
  });

  it('narrows to one state when asked', async () => {
    const io = capture();
    await run(
      [
        'standards',
        '-s',
        registerPath,
        '--today',
        '2025-05-01',
        '--only',
        'retired',
        '--format',
        'json',
      ],
      io
    );
    expect(JSON.parse(io.out.text()).standards).toHaveLength(1);
  });

  it('takes a looser limit and stops complaining', async () => {
    const io = capture();
    expect(
      await run(['standards', '-s', registerPath, '--today', '2025-05-01', '--limit', '20'], io)
    ).toBe(0);
  });

  it('refuses an empty register', async () => {
    const io = capture();
    const empty = await registerFile('empty.json', []);
    expect(await run(['standards', '-s', empty, '--today', '2025-05-01'], io)).toBe(4);
  });

  it('says which standard in the register is unusable', async () => {
    const io = capture();
    const broken = await registerFile('broken.json', [{ ...register[0], readings: [] }]);
    expect(await run(['standards', '-s', broken, '--today', '2025-05-01'], io)).toBe(4);
    expect(io.err.text()).toMatch(/row 0 in the standards register is not usable/);
  });

  it('needs a date rather than reading the clock', async () => {
    const io = capture();
    expect(await run(['standards', '-s', registerPath], io)).toBe(2);
    expect(io.err.text()).toMatch(/--today/);
  });
});

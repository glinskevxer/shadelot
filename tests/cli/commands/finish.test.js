import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const cloth = fileURLToPath(new URL('../../../examples/cloth-panel.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-finish-'));
});

describe('the finish command', () => {
  it('prescribes a softener for a handle that was asked for', async () => {
    const io = capture();
    expect(await run(['finish', '-c', cloth, '--handle', '3.5'], io)).toBe(0);
    expect(io.out.text()).toMatch(/verdict\s+pass/);
    expect(io.out.text()).toMatch(/softener\s+\w/);
  });

  it('always prints the trade off, even on a pass', async () => {
    const io = capture();
    await run(['finish', '-c', cloth, '--handle', '3.5'], io);
    expect(io.out.text()).toMatch(/trade off\s+handle up/);
  });

  it('shows every axis with what it moved', async () => {
    const io = capture();
    await run(['finish', '-c', cloth, '--handle', '3.5', '--format', 'json'], io);
    const rows = JSON.parse(io.out.text()).rows;
    expect(rows.map((row) => row.axis)).toContain('rubWet');
    expect(rows.find((row) => row.axis === 'rubWet').change).toBeLessThan(0);
  });

  it('marks the axes that were asked for as met or short', async () => {
    const io = capture();
    await run(['finish', '-c', cloth, '--handle', '3.5', '--rub-wet', '3', '--format', 'json'], io);
    const rows = JSON.parse(io.out.text()).rows;
    expect(rows.find((row) => row.axis === 'handle').state).toBe('met');
    expect(rows.find((row) => row.axis === 'sewability').state).toBe('');
  });

  it('runs a named softener instead of choosing one', async () => {
    const io = capture();
    await run(
      ['finish', '-c', cloth, '--softener', 'cationic', '--owf', '2', '--format', 'json'],
      io
    );
    const result = JSON.parse(io.out.text());
    expect(result.softener).toBe('cationic');
    expect(result.owf).toBe(2);
  });

  it('leaves with the out of tolerance code when a named one falls short', async () => {
    const io = capture();
    expect(await run(['finish', '-c', cloth, '--softener', 'none', '--handle', '4'], io)).toBe(5);
    expect(io.err.text()).toMatch(/does not meet handle/);
  });

  it('says so when nothing it runs will meet the specification', async () => {
    const io = capture();
    expect(await run(['finish', '-c', cloth, '--handle', '5', '--rub-wet', '5'], io)).toBe(4);
    expect(io.err.text()).toMatch(/cannot be met by any finish/);
  });

  it('refuses to prescribe when nothing was asked for', async () => {
    const io = capture();
    expect(await run(['finish', '-c', cloth], io)).toBe(4);
    expect(io.err.text()).toMatch(/nothing was asked for/);
  });

  it('refuses a panel score that is not a number', async () => {
    const io = capture();
    const path = join(directory, 'bad.json');
    await writeFile(path, JSON.stringify({ handle: 'soft' }), 'utf8');
    expect(await run(['finish', '-c', path, '--handle', '3'], io)).toBe(4);
    expect(io.err.text()).toMatch(/handle in the cloth file must be a number/);
  });

  it('refuses a softener the works does not stock', async () => {
    const io = capture();
    expect(await run(['finish', '-c', cloth, '--softener', 'wax'], io)).toBe(4);
  });
});

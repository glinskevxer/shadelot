import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { fromDelimited } from '../../../src/store/export.js';

const month = fileURLToPath(new URL('../../../examples/month-batches.json', import.meta.url));
const stock = fileURLToPath(new URL('../../../examples/stock.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
let output;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-export-'));
  output = join(directory, 'batches.csv');
});

describe('the export command', () => {
  it('writes a file the accounts package could read', async () => {
    const io = capture();
    expect(await run(['export', '-i', month, '-o', output], io)).toBe(0);
    const rows = fromDelimited(await readFile(output, 'utf8'));
    expect(rows).toHaveLength(48);
    expect(Object.keys(rows[0])).toContain('batch');
  });

  it('says what it wrote', async () => {
    const io = capture();
    await run(['export', '-i', month, '-o', output], io);
    expect(io.out.text()).toMatch(/rows\s+48/);
    expect(io.out.text()).toMatch(/bytes\s+\d+/);
  });

  it('writes another column set when asked', async () => {
    const io = capture();
    await run(['export', '-i', stock, '-o', output, '--set', 'stock'], io);
    const rows = fromDelimited(await readFile(output, 'utf8'));
    expect(Object.keys(rows[0])).toContain('on hand');
  });

  it('writes another delimiter when asked', async () => {
    const io = capture();
    await run(['export', '-i', month, '-o', output, '--delimited', 'tsv'], io);
    expect((await readFile(output, 'utf8')).split('\n')[0]).toContain('\t');
  });

  it('leaves the heading line off when told to', async () => {
    const io = capture();
    await run(['export', '-i', month, '-o', output, '--no-header'], io);
    expect((await readFile(output, 'utf8')).split('\n')[0]).toMatch(/^B25-/);
  });

  it('will not write over a file that is there', async () => {
    await writeFile(output, 'last month', 'utf8');
    const io = capture();
    expect(await run(['export', '-i', month, '-o', output], io)).toBe(4);
    expect(io.err.text()).toMatch(/pass --overwrite to replace it/);
    expect(await readFile(output, 'utf8')).toBe('last month');
  });

  it('writes over it when told to', async () => {
    await writeFile(output, 'last month', 'utf8');
    const io = capture();
    expect(await run(['export', '-i', month, '-o', output, '--overwrite'], io)).toBe(0);
    expect(await readFile(output, 'utf8')).not.toBe('last month');
  });

  it('warns when a whole column came out empty, which means the wrong set', async () => {
    const io = capture();
    await run(['export', '-i', stock, '-o', output, '--set', 'batches'], io);
    expect(io.out.text()).toMatch(/these columns were empty on every row/);
  });

  it('warns about a derived column the raw file does not carry', async () => {
    const io = capture();
    await run(['export', '-i', stock, '-o', output, '--set', 'stock', '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).missing).toEqual(['remainingKg']);
  });

  it('says nothing about empty columns when the file carries them all', async () => {
    const complete = join(directory, 'complete.json');
    await writeFile(
      complete,
      JSON.stringify([
        { lotId: 'S1', code: 'RB-19', remainingKg: 12, pricePerKg: 24, receivedAt: '2025-01-04' },
      ]),
      'utf8'
    );
    const io = capture();
    await run(['export', '-i', complete, '-o', output, '--set', 'stock', '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).missing).toEqual([]);
  });

  it('refuses a column set nothing writes', async () => {
    const io = capture();
    expect(await run(['export', '-i', month, '-o', output, '--set', 'invoices'], io)).toBe(4);
  });

  it('refuses a delimiter nothing writes', async () => {
    const io = capture();
    expect(await run(['export', '-i', month, '-o', output, '--delimited', 'xls'], io)).toBe(4);
  });

  it('reports a missing input rather than writing an empty file', async () => {
    const io = capture();
    expect(await run(['export', '-i', '/nowhere.json', '-o', output], io)).toBe(3);
  });
});

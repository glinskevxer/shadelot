import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const day = fileURLToPath(new URL('../../../examples/day-sequence.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-seq-'));
});

describe('the sequence command', () => {
  it('orders the shipped day light to dark inside each class', async () => {
    const io = capture();
    expect(await run(['sequence', '-d', day, '--format', 'json'], io)).toBe(0);
    const order = JSON.parse(io.out.text()).order;
    const reactive = order.filter((row) => row.dyeClass === 'reactive').map((row) => row.depth);
    expect([...reactive].sort((a, b) => a - b)).toEqual(reactive);
  });

  it('keeps the two classes apart', async () => {
    const io = capture();
    await run(['sequence', '-d', day, '--format', 'json'], io);
    const classes = JSON.parse(io.out.text()).order.map((row) => row.dyeClass);
    expect(classes.indexOf('reactive')).toBeGreaterThan(classes.lastIndexOf('disperse'));
  });

  it('shows what the ordering saved', async () => {
    const io = capture();
    await run(['sequence', '-d', day], io);
    expect(io.out.text()).toMatch(/saved by ordering/);
    expect(io.out.text()).toMatch(/as they arrived/);
  });

  it('costs the order the batches arrived in when asked', async () => {
    const io = capture();
    await run(['sequence', '-d', day, '--as-given', '--format', 'json'], io);
    const order = JSON.parse(io.out.text()).order.map((row) => row.id);
    expect(order[0]).toBe('B25-00311');
  });

  it('pulls an urgent batch forward inside its class', async () => {
    const io = capture();
    await run(['sequence', '-d', day, '--urgent-before', '2025-05-15', '--format', 'json'], io);
    const reactive = JSON.parse(io.out.text()).order.filter((row) => row.dyeClass === 'reactive');
    expect(reactive[0].id).toBe('B25-00311');
  });

  it('names the cleaning each changeover needs', async () => {
    const io = capture();
    await run(['sequence', '-d', day, '--format', 'json'], io);
    const cleans = JSON.parse(io.out.text()).order.map((row) => row.clean);
    expect(cleans[0]).toBe('rinse');
    expect(new Set(cleans).size).toBeGreaterThan(1);
  });

  it('reports an overrun against a short day', async () => {
    const io = capture();
    await run(['sequence', '-d', day, '--hours', '8'], io);
    expect(io.out.text()).toMatch(/overrun\s+\d/);
  });

  it('says none when the day fits', async () => {
    const io = capture();
    await run(['sequence', '-d', day, '--hours', '48'], io);
    expect(io.out.text()).toMatch(/overrun\s+none/);
  });

  it('refuses an empty day', async () => {
    const io = capture();
    const path = join(directory, 'empty.json');
    await writeFile(path, '[]', 'utf8');
    expect(await run(['sequence', '-d', path], io)).toBe(4);
  });

  it('says which batch is short of a depth', async () => {
    const io = capture();
    const path = join(directory, 'bad.json');
    await writeFile(path, JSON.stringify([{ id: 'B1' }]), 'utf8');
    expect(await run(['sequence', '-d', path], io)).toBe(4);
    expect(io.err.text()).toMatch(/batch 0 in the day file needs an id and a depth/);
  });
});

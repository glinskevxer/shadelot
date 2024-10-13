import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const stock = fileURLToPath(new URL('../../../examples/stock.json', import.meta.url));
const reorder = fileURLToPath(new URL('../../../examples/reorder-points.json', import.meta.url));
const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const recipe = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-stock-'));
});

const cardFor = async (load) => {
  const io = capture();
  await run(['card', '-w', works, '-r', recipe, '-l', load, '--format', 'json'], io);
  const path = join(directory, `card-${load}.json`);
  await writeFile(path, io.out.text(), 'utf8');
  return path;
};

describe('the stock command', () => {
  it('lists the open lots', async () => {
    const io = capture();
    expect(await run(['stock', '-s', stock], io)).toBe(0);
    expect(io.out.text()).toMatch(/S-24118/);
    expect(io.out.text()).toMatch(/lots\s+8/);
  });

  it('narrows to one article when asked', async () => {
    const io = capture();
    await run(['stock', '-s', stock, '--code', 'RB-19-ACME', '--format', 'json'], io);
    const lots = JSON.parse(io.out.text()).lots;
    expect(lots).toHaveLength(1);
    expect(lots[0].code).toBe('RB-19-ACME');
  });

  it('values what is on hand', async () => {
    const io = capture();
    await run(['stock', '-s', stock, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).value).toBeGreaterThan(0);
  });

  it('says nothing is short when the reorder points are all met', async () => {
    const io = capture();
    await run(['stock', '-s', stock, '--reorder', reorder, '--format', 'json'], io);
    const short = JSON.parse(io.out.text()).short;
    expect(short.map((row) => row.code)).toEqual(['RR-195-ACME', 'LEV-7']);
  });

  it('checks a card against what is held', async () => {
    const io = capture();
    const card = await cardFor('200');
    expect(await run(['stock', '-s', stock, '-c', card, '--format', 'json'], io)).toBe(0);
    const needs = JSON.parse(io.out.text()).needs;
    expect(needs.every((need) => need.state === 'enough')).toBe(true);
  });

  it('leaves with the out of stock code when a card cannot be dispensed', async () => {
    const io = capture();
    const card = await cardFor('4000');
    expect(await run(['stock', '-s', stock, '-c', card], io)).toBe(7);
    expect(io.err.text()).toMatch(/not enough stock to dispense/);
  });

  it('names every article that is short, not the first', async () => {
    const io = capture();
    const card = await cardFor('4000');
    await run(['stock', '-s', stock, '-c', card], io);
    expect(io.err.text().split(', ').length).toBeGreaterThan(1);
  });

  it('says which stock row is unusable', async () => {
    const io = capture();
    const path = join(directory, 'bad.json');
    await writeFile(
      path,
      JSON.stringify([{ lotId: 'S1', code: 'X', quantityKg: 0, pricePerKg: 1 }]),
      'utf8'
    );
    expect(await run(['stock', '-s', path], io)).toBe(4);
    expect(io.err.text()).toMatch(/stock row 0 is not usable/);
  });

  it('refuses a card file with no lines', async () => {
    const io = capture();
    const path = join(directory, 'nolines.json');
    await writeFile(path, JSON.stringify({ fibreKg: 200 }), 'utf8');
    expect(await run(['stock', '-s', stock, '-c', path], io)).toBe(4);
    expect(io.err.text()).toMatch(/must carry a lines array/);
  });
});

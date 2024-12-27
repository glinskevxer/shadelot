import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const standard = fileURLToPath(new URL('../../../examples/standard-set.json', import.meta.url));
const batch = fileURLToPath(new URL('../../../examples/batch-set.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-mi-'));
});

const setFile = async (name, document) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(document), 'utf8');
  return path;
};

describe('the metamerism command', () => {
  it('passes the shipped pair, which tracks under all three lamps', async () => {
    const io = capture();
    expect(await run(['metamerism', '-s', standard, '-b', batch], io)).toBe(0);
    expect(io.out.text()).toMatch(/metameric\s+no/);
  });

  it('prints one row per lamp with what the lamp is', async () => {
    const io = capture();
    await run(['metamerism', '-s', standard, '-b', batch], io);
    const text = io.out.text();
    expect(text).toMatch(/D65/);
    expect(text).toMatch(/shop fluorescent/);
    expect(text).toMatch(/tungsten/);
  });

  it('leaves the drift blank under the lamp the pair was matched on', async () => {
    const io = capture();
    await run(['metamerism', '-s', standard, '-b', batch, '--format', 'json'], io);
    const lamps = JSON.parse(io.out.text()).lamps;
    expect(lamps.find((lamp) => lamp.illuminant === 'D65').drift).toBeNull();
  });

  it('fails a pair that parts company under the shop light', async () => {
    const io = capture();
    const metameric = await setFile('meta.json', {
      D65: { L: 52.2, a: -14.3, b: 22.7 },
      TL84: { L: 53.6, a: -12.2, b: 20.4 },
      A: { L: 55.1, a: -9.4, b: 26.9 },
    });
    expect(await run(['metamerism', '-s', standard, '-b', metameric], io)).toBe(5);
    expect(io.err.text()).toMatch(/drifts|out of tolerance/);
  });

  it('names the lamp the pair drifts worst under', async () => {
    const io = capture();
    const metameric = await setFile('meta.json', {
      D65: { L: 52.2, a: -14.3, b: 22.7 },
      TL84: { L: 53.6, a: -12.2, b: 20.4 },
      A: { L: 55.1, a: -9.4, b: 26.9 },
    });
    await run(['metamerism', '-s', standard, '-b', metameric, '--format', 'json'], io);
    expect(['TL84', 'A']).toContain(JSON.parse(io.out.text()).worstUnder);
  });

  it('takes another lamp as the one the pair was matched under', async () => {
    const io = capture();
    await run(
      ['metamerism', '-s', standard, '-b', batch, '--primary', 'TL84', '--format', 'json'],
      io
    );
    expect(JSON.parse(io.out.text()).primary).toBe('TL84');
  });

  it('refuses a lamp the cabinet does not have', async () => {
    const io = capture();
    expect(await run(['metamerism', '-s', standard, '-b', batch, '--primary', 'F11'], io)).toBe(4);
  });

  it('refuses a reading set with a lamp missing', async () => {
    const io = capture();
    const partial = await setFile('partial.json', { D65: { L: 52, a: -14, b: 22 } });
    expect(await run(['metamerism', '-s', partial, '-b', batch], io)).toBe(4);
    expect(io.err.text()).toMatch(/missing a lab reading under/);
  });

  it('judges under a named works block', async () => {
    const io = capture();
    await run(['metamerism', '-s', standard, '-b', batch, '-w', works, '-t', 'workwear'], io);
    expect(io.out.text()).toMatch(/workwear \(cie76, total 2\)/);
  });

  it('calls a small drift metameric under a tight limit', async () => {
    const io = capture();
    expect(await run(['metamerism', '-s', standard, '-b', batch, '--limit', '0.0001'], io)).toBe(5);
  });
});

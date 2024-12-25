import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const standard = fileURLToPath(new URL('../../../examples/standard-olive.json', import.meta.url));
const batch = fileURLToPath(new URL('../../../examples/batch-olive.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-shade-'));
});

const readingFile = async (name, reading) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(reading), 'utf8');
  return path;
};

describe('the shade command', () => {
  it('judges the shipped pair and prints every axis', async () => {
    const io = capture();
    const code = await run(['shade', '-s', standard, '-b', batch], io);
    expect([0, 5]).toContain(code);
    const text = io.out.text();
    expect(text).toMatch(/^dL/m);
    expect(text).toMatch(/^dC/m);
    expect(text).toMatch(/^dH/m);
  });

  it('passes a batch sitting on the standard', async () => {
    const io = capture();
    const same = await readingFile('same.json', { L: 52.14, a: -14.32, b: 22.68 });
    expect(await run(['shade', '-s', standard, '-b', same], io)).toBe(0);
    expect(io.out.text()).toMatch(/verdict\s+pass/);
    expect(io.out.text()).toMatch(/reads as\s+on shade/);
  });

  it('leaves with the out of tolerance code when it fails', async () => {
    const io = capture();
    const far = await readingFile('far.json', { L: 58, a: -10, b: 26 });
    expect(await run(['shade', '-s', standard, '-b', far], io)).toBe(5);
    expect(io.err.text()).toMatch(/out of tolerance at/);
  });

  it('reads a named block out of the works file', async () => {
    const io = capture();
    const same = await readingFile('same.json', { L: 52.14, a: -14.32, b: 22.68 });
    await run(['shade', '-s', standard, '-b', same, '-w', works, '-t', 'workwear'], io);
    expect(io.out.text()).toMatch(/tolerance\s+workwear \(cie76, total 2\)/);
  });

  it('needs the works file when a block is named', async () => {
    const io = capture();
    expect(await run(['shade', '-s', standard, '-b', batch, '-t', 'workwear'], io)).toBe(4);
    expect(io.err.text()).toMatch(/needs the works file/);
  });

  it('says which blocks exist when one is misnamed', async () => {
    const io = capture();
    expect(await run(['shade', '-s', standard, '-b', batch, '-w', works, '-t', 'nope'], io)).toBe(
      4
    );
    expect(io.err.text()).toMatch(/no tolerance called "nope"/);
  });

  it('takes a formula and a total off the command line', async () => {
    const io = capture();
    const near = await readingFile('near.json', { L: 52.6, a: -14.32, b: 22.68 });
    await run(['shade', '-s', standard, '-b', near, '--formula', 'cie76', '--total', '5'], io);
    expect(io.out.text()).toMatch(/cie76, total 5/);
  });

  it('refuses a reading missing a channel', async () => {
    const io = capture();
    const bad = await readingFile('bad.json', { L: 52, a: -14 });
    expect(await run(['shade', '-s', standard, '-b', bad], io)).toBe(4);
    expect(io.err.text()).toMatch(/missing a usable b/);
  });

  it('prints json carrying the axes and the breaches', async () => {
    const io = capture();
    const far = await readingFile('far.json', { L: 58, a: -10, b: 26 });
    await run(['shade', '-s', standard, '-b', far, '--format', 'json'], io);
    const result = JSON.parse(io.out.text());
    expect(result.verdict).toBe('fail');
    expect(result.axes).toHaveLength(3);
  });
});

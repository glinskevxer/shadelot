import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const seriesPath = fileURLToPath(new URL('../../../examples/dip-series.json', import.meta.url));
const series = JSON.parse(readFileSync(seriesPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-dip-'));
});

const seriesFile = async (name, document) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(document), 'utf8');
  return path;
};

describe('the dip command', () => {
  it('judges every dip in the shipped series', async () => {
    const io = capture();
    expect(await run(['dip', '-s', seriesPath], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/R25-00081a/);
    expect(text).toMatch(/R25-00081d/);
    expect(text).toMatch(/rounds\s+4/);
  });

  it('names the closest dip', async () => {
    const io = capture();
    await run(['dip', '-s', seriesPath], io);
    expect(io.out.text()).toMatch(/closest\s+R25-00081d/);
  });

  it('shows every axis so the lab can see which way to trim', async () => {
    const io = capture();
    await run(['dip', '-s', seriesPath, '--format', 'json'], io);
    const dips = JSON.parse(io.out.text()).dips;
    expect(dips[0].dL).toBeGreaterThan(0);
    expect(dips).toHaveLength(4);
  });

  it('keeps the technician note against each round', async () => {
    const io = capture();
    await run(['dip', '-s', seriesPath], io);
    expect(io.out.text()).toMatch(/raised the blue/);
  });

  it('leaves the submission open unless told to close it', async () => {
    const io = capture();
    await run(['dip', '-s', seriesPath, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).outcome).toBe('pending');
  });

  it('approves on the closest when told to close', async () => {
    const io = capture();
    await run(['dip', '-s', seriesPath, '--close', '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).outcome).toBe('approved');
  });

  it('leaves with the out of tolerance code when nothing landed', async () => {
    const io = capture();
    const far = await seriesFile('far.json', {
      ...series,
      dips: [{ recipeId: 'R1', reading: { L: 62, a: -4, b: 32 } }],
    });
    expect(await run(['dip', '-s', far], io)).toBe(5);
    expect(io.err.text()).toMatch(/no dip in the series is inside the tolerance/);
  });

  it('reads a named block out of the works file', async () => {
    const io = capture();
    await run(['dip', '-s', seriesPath, '-w', works, '-t', 'workwear'], io);
    expect(io.out.text()).toMatch(/workwear \(cie76, total 2\)/);
  });

  it('needs the works file for a named block', async () => {
    const io = capture();
    expect(await run(['dip', '-s', seriesPath, '-t', 'workwear'], io)).toBe(4);
    expect(io.err.text()).toMatch(/needs the works file/);
  });

  it('takes a bare reading in the dips array', async () => {
    const io = capture();
    const bare = await seriesFile('bare.json', {
      ...series,
      dips: [{ L: 52.2, a: -14.3, b: 22.7 }],
    });
    expect(await run(['dip', '-s', bare, '--format', 'json'], io)).toBe(0);
    expect(JSON.parse(io.out.text()).dips[0].recipeId).toBe('round 1');
  });

  it('refuses a series with no dips', async () => {
    const io = capture();
    const empty = await seriesFile('empty.json', { ...series, dips: [] });
    expect(await run(['dip', '-s', empty], io)).toBe(4);
    expect(io.err.text()).toMatch(/at least one reading/);
  });

  it('refuses a standard that is not a reading', async () => {
    const io = capture();
    const bad = await seriesFile('bad.json', { ...series, standard: { L: 52 } });
    expect(await run(['dip', '-s', bad], io)).toBe(4);
    expect(io.err.text()).toMatch(/standard is missing a usable a and b/);
  });
});

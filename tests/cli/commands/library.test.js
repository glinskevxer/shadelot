import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const standard = fileURLToPath(new URL('../../../examples/standard-olive.json', import.meta.url));
const dips = fileURLToPath(new URL('../../../examples/dip-library.json', import.meta.url));
const recipes = fileURLToPath(new URL('../../../examples/recipe-library.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-library-'));
});

describe('the library command', () => {
  it('finds the exact standard first', async () => {
    const io = capture();
    expect(await run(['library', '-s', standard, '--dips', dips], io)).toBe(0);
    const rows = io.out
      .text()
      .split('\n')
      .filter((line) => line.startsWith('L2'));
    expect(rows[0]).toMatch(/L25-00044/);
  });

  it('leaves out a standard nowhere near', async () => {
    const io = capture();
    await run(['library', '-s', standard, '--dips', dips, '--format', 'json'], io);
    const found = JSON.parse(io.out.text()).dips.map((row) => row.submissionId);
    expect(found).not.toContain('L24-00402');
  });

  it('honours how far to look', async () => {
    const io = capture();
    await run(
      ['library', '-s', standard, '--dips', dips, '--within', '0.1', '--format', 'json'],
      io
    );
    expect(JSON.parse(io.out.text()).dips).toHaveLength(1);
  });

  it('prefers work on the same substrate', async () => {
    const io = capture();
    await run(
      [
        'library',
        '-s',
        standard,
        '--dips',
        dips,
        '--substrate',
        'cotton twill 210gsm',
        '--format',
        'json',
      ],
      io
    );
    expect(JSON.parse(io.out.text()).dips[0].submissionId).toBe('L24-00318');
  });

  it('says so plainly when there is nothing close', async () => {
    const io = capture();
    const far = join(directory, 'far.json');
    await writeFile(far, JSON.stringify({ L: 12, a: 44, b: -38 }), 'utf8');
    await run(['library', '-s', far, '--dips', dips], io);
    expect(io.out.text()).toMatch(/nothing in the dip library is close/);
  });

  it('searches the recipe library on the ratios', async () => {
    const io = capture();
    await run(
      [
        'library',
        '-s',
        standard,
        '--dips',
        dips,
        '--recipes',
        recipes,
        '-w',
        works,
        '--format',
        'json',
      ],
      io
    );
    const found = JSON.parse(io.out.text()).recipes;
    expect(found[0].id).toBe('R25-00092');
    expect(found[0].distance).toBeCloseTo(0, 6);
  });

  it('needs the works file to read the recipe library', async () => {
    const io = capture();
    expect(await run(['library', '-s', standard, '--recipes', recipes], io)).toBe(4);
    expect(io.err.text()).toMatch(/needs the works file its dyes live in/);
  });

  it('says which recipe in the library is unusable', async () => {
    const io = capture();
    const bad = join(directory, 'bad.json');
    await writeFile(bad, JSON.stringify([{ id: 'R1' }]), 'utf8');
    expect(await run(['library', '-s', standard, '--recipes', bad, '-w', works], io)).toBe(4);
    expect(io.err.text()).toMatch(/row 0 in the recipe library is not usable/);
  });

  it('scales the nearest recipe to a wanted depth', async () => {
    const io = capture();
    await run(
      [
        'library',
        '-s',
        standard,
        '--dips',
        dips,
        '--recipes',
        recipes,
        '-w',
        works,
        '--target',
        '1',
        '--format',
        'json',
      ],
      io
    );
    const scaled = JSON.parse(io.out.text()).scaled;
    expect(scaled.totalOwf).toBe(1);
    expect(scaled.dyes.reduce((sum, dye) => sum + dye.owf, 0)).toBeCloseTo(1, 9);
  });

  it('does nothing but read the standard when no library is named', async () => {
    const io = capture();
    expect(await run(['library', '-s', standard, '--format', 'json'], io)).toBe(0);
    const result = JSON.parse(io.out.text());
    expect(result.dips).toEqual([]);
    expect(result.recipes).toEqual([]);
  });

  it('refuses a standard that is not a reading', async () => {
    const io = capture();
    const bad = join(directory, 'bad-standard.json');
    await writeFile(bad, JSON.stringify({ L: 52 }), 'utf8');
    expect(await run(['library', '-s', bad, '--dips', dips], io)).toBe(4);
  });
});

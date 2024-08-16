import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const recipe = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
const standard = fileURLToPath(new URL('../../../examples/standard-olive.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-correct-'));
});

const readingFile = async (name, value) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value), 'utf8');
  return path;
};

describe('the correct command', () => {
  it('accepts a batch that passed', async () => {
    const io = capture();
    const same = await readingFile('same.json', { L: 52.14, a: -14.32, b: 22.68 });
    expect(await run(['correct', '-s', standard, '-b', same], io)).toBe(0);
    expect(io.out.text()).toMatch(/action\s+accept/);
    expect(io.out.text()).toMatch(/machine time\s+no/);
  });

  it('names the rule that fired as well as the action', async () => {
    const io = capture();
    const weak = await readingFile('weak.json', { L: 54.6, a: -14.2, b: 22.5 });
    await run(['correct', '-s', standard, '-b', weak, '--strength', '0.92'], io);
    expect(io.out.text()).toMatch(/action\s+add-on/);
    expect(io.out.text()).toMatch(/rule\s+weak enough to add on/);
  });

  it('works an add on dose per dye when it has the recipe and the load', async () => {
    const io = capture();
    const weak = await readingFile('weak.json', { L: 54.6, a: -14.2, b: 22.5 });
    await run(
      ['correct', '-s', standard, '-b', weak, '--strength', '0.92', '-r', recipe, '-l', '200'],
      io
    );
    const text = io.out.text();
    expect(text).toMatch(/RY-145-ACME/);
    expect(text).toMatch(/add kg/);
  });

  it('leaves the dose table out when it has no recipe', async () => {
    const io = capture();
    const weak = await readingFile('weak.json', { L: 54.6, a: -14.2, b: 22.5 });
    await run(['correct', '-s', standard, '-b', weak, '--strength', '0.92'], io);
    expect(io.out.text()).not.toMatch(/add kg/);
  });

  it('sends a hue failure to strip and redye', async () => {
    const io = capture();
    const hue = await readingFile('hue.json', { L: 52.14, a: -10.9, b: 24.9 });
    await run(['correct', '-s', standard, '-b', hue, '--strength', '0.98'], io);
    expect(io.out.text()).toMatch(/action\s+strip-and-redye/);
  });

  it('downgrades once the batch has been round twice', async () => {
    const io = capture();
    const weak = await readingFile('weak.json', { L: 54.6, a: -14.2, b: 22.5 });
    await run(['correct', '-s', standard, '-b', weak, '--strength', '0.92', '--prior', '2'], io);
    expect(io.out.text()).toMatch(/action\s+downgrade/);
  });

  it('judges under a named block from the works file', async () => {
    const io = capture();
    const near = await readingFile('near.json', { L: 53.2, a: -14.3, b: 22.7 });
    await run(
      ['correct', '-s', standard, '-b', near, '-w', works, '-t', 'workwear', '--strength', '0.95'],
      io
    );
    expect(io.out.text()).toMatch(/action\s+accept/);
  });

  it('prints json with the doses in it', async () => {
    const io = capture();
    const weak = await readingFile('weak.json', { L: 54.6, a: -14.2, b: 22.5 });
    await run(
      [
        'correct',
        '-s',
        standard,
        '-b',
        weak,
        '--strength',
        '0.92',
        '-r',
        recipe,
        '-l',
        '200',
        '--format',
        'json',
      ],
      io
    );
    const result = JSON.parse(io.out.text());
    expect(result.action).toBe('add-on');
    expect(result.doses).toHaveLength(3);
    expect(result.doses[0].addKg).toBeGreaterThan(0);
  });

  it('says the strength was not measured when none was given', async () => {
    const io = capture();
    const weak = await readingFile('weak.json', { L: 54.6, a: -14.2, b: 22.5 });
    await run(['correct', '-s', standard, '-b', weak], io);
    expect(io.out.text()).toMatch(/strength\s+not measured/);
  });
});

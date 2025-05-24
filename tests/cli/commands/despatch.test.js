import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const rollsPath = fileURLToPath(new URL('../../../examples/finished-rolls.json', import.meta.url));
const rolls = JSON.parse(readFileSync(rollsPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-despatch-'));
});

const rollsFile = async (name, rows) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(rows), 'utf8');
  return path;
};

describe('the despatch command', () => {
  it('packs the shipped rolls one shade a bale by default', async () => {
    const io = capture();
    expect(await run(['despatch', '-r', rollsPath, '-o', 'O25-0900', '--format', 'json'], io)).toBe(
      0
    );
    const bales = JSON.parse(io.out.text()).bales;
    expect(bales).toHaveLength(2);
    expect(bales[0].shades).toEqual(['olive 4488']);
  });

  it('prints the note under the bales', async () => {
    const io = capture();
    await run(['despatch', '-r', rollsPath, '-o', 'O25-0900'], io);
    const text = io.out.text();
    expect(text).toMatch(/order\s+O25-0900/);
    expect(text).toMatch(/rolls\s+7/);
    expect(text).toMatch(/shades\s+navy 118, olive 4488/);
  });

  it('packs to a metreage when the customer asks for one', async () => {
    const io = capture();
    await run(
      [
        'despatch',
        '-r',
        rollsPath,
        '-o',
        'O25-0900',
        '--rule',
        'fixed-metres',
        '--metres',
        '650',
        '--format',
        'json',
      ],
      io
    );
    for (const bale of JSON.parse(io.out.text()).bales) {
      expect(bale.metres).toBeLessThanOrEqual(650);
    }
  });

  it('packs to a weight when they ask for that instead', async () => {
    const io = capture();
    await run(
      [
        'despatch',
        '-r',
        rollsPath,
        '-o',
        'O25-0900',
        '--rule',
        'fill-to-weight',
        '--kg',
        '130',
        '--format',
        'json',
      ],
      io
    );
    for (const bale of JSON.parse(io.out.text()).bales) {
      expect(bale.kg).toBeLessThanOrEqual(130);
    }
  });

  it('holds the machine order when that is the rule', async () => {
    const io = capture();
    await run(
      [
        'despatch',
        '-r',
        rollsPath,
        '-o',
        'O25-0900',
        '--rule',
        'machine-order',
        '--max-rolls',
        '3',
        '--format',
        'json',
      ],
      io
    );
    const bales = JSON.parse(io.out.text()).bales;
    expect(bales[0].rolls).toEqual(['R-1204', 'R-1205', 'R-1206']);
  });

  it('needs the metreage for the fixed metres rule', async () => {
    const io = capture();
    expect(await run(['despatch', '-r', rollsPath, '-o', 'O1', '--rule', 'fixed-metres'], io)).toBe(
      4
    );
    expect(io.err.text()).toMatch(/metresPerBale/);
  });

  it('refuses a rule nobody asked for', async () => {
    const io = capture();
    expect(await run(['despatch', '-r', rollsPath, '-o', 'O1', '--rule', 'alphabetical'], io)).toBe(
      4
    );
  });

  it('leaves with the invalid data code when its own packing breaks the rule', async () => {
    const io = capture();
    const long = await rollsFile('long.json', [{ id: 'R1', shade: 'olive', metres: 900, kg: 190 }]);
    expect(
      await run(
        ['despatch', '-r', long, '-o', 'O1', '--rule', 'fixed-metres', '--metres', '250'],
        io
      )
    ).toBe(4);
    expect(io.err.text()).toMatch(/breaks the fixed-metres rule/);
  });

  it('says which bale broke it', async () => {
    const io = capture();
    const long = await rollsFile('long.json', [{ id: 'R1', shade: 'olive', metres: 900, kg: 190 }]);
    await run(
      ['despatch', '-r', long, '-o', 'O1', '--rule', 'fixed-metres', '--metres', '250'],
      io
    );
    expect(io.out.text()).toMatch(/bale 1 carries 900 metres/);
  });

  it('carries the despatch date when it is given', async () => {
    const io = capture();
    await run(['despatch', '-r', rollsPath, '-o', 'O25-0900', '--at', '2025-05-14'], io);
    expect(io.out.text()).toMatch(/despatched\s+2025-05-14/);
  });

  it('says it is not dated when it is not', async () => {
    const io = capture();
    await run(['despatch', '-r', rollsPath, '-o', 'O25-0900'], io);
    expect(io.out.text()).toMatch(/despatched\s+not dated/);
  });

  it('refuses an empty delivery', async () => {
    const io = capture();
    const empty = await rollsFile('empty.json', []);
    expect(await run(['despatch', '-r', empty, '-o', 'O1'], io)).toBe(4);
    expect(io.err.text()).toMatch(/nothing to despatch/);
  });

  it('refuses a roll with no length on it', async () => {
    const io = capture();
    const bad = await rollsFile('bad.json', [{ id: 'R1', shade: 'olive', kg: 20 }]);
    expect(await run(['despatch', '-r', bad, '-o', 'O1'], io)).toBe(4);
    expect(io.err.text()).toMatch(/roll.metres/);
  });

  it('carries every roll from the file into a bale exactly once', async () => {
    const io = capture();
    await run(['despatch', '-r', rollsPath, '-o', 'O25-0900', '--format', 'json'], io);
    const packed = JSON.parse(io.out.text()).bales.flatMap((bale) => bale.rolls);
    expect(packed.sort()).toEqual(rolls.map((roll) => roll.id).sort());
  });

  it('is unchanged by rerunning it on the same rolls', async () => {
    const first = capture();
    await run(['despatch', '-r', rollsPath, '-o', 'O25-0900', '--format', 'json'], first);
    const second = capture();
    await run(['despatch', '-r', rollsPath, '-o', 'O25-0900', '--format', 'json'], second);
    expect(first.out.text()).toBe(second.out.text());
  });
});

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const recipe = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
const lots = fileURLToPath(new URL('../../../examples/lots.json', import.meta.url));
const small = fileURLToPath(new URL('../../../examples/lots-small.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

describe('the plan command', () => {
  it('lists the candidate machines when none is named', async () => {
    const io = capture();
    expect(await run(['plan', '-w', works, '-r', recipe, '-g', lots], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/JET-4/);
    expect(text).toMatch(/PAD-1\s+pad-mangle\s+no\s+wrong-process/);
  });

  it('totals the lots it was given', async () => {
    const io = capture();
    await run(['plan', '-w', works, '-r', recipe, '-g', lots], io);
    expect(io.out.text()).toMatch(/198\.500 kg over 3 lots/);
  });

  it('plans onto the machine it is told to', async () => {
    const io = capture();
    expect(await run(['plan', '-w', works, '-r', recipe, '-g', lots, '-m', 'JET-4'], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/machine\s+JET-4 \(jet\)/);
    expect(text).toMatch(/ratio given/);
  });

  it('says plainly when it has moved the grams per litre lines', async () => {
    const io = capture();
    await run(['plan', '-w', works, '-r', recipe, '-g', small, '-m', 'JET-5'], io);
    expect(io.out.text()).toMatch(/re-dosed\s+yes/);
  });

  it('says it has not when the machine gives the ratio asked for', async () => {
    const io = capture();
    await run(['plan', '-w', works, '-r', recipe, '-g', lots, '-m', 'JET-4'], io);
    expect(io.out.text()).toMatch(/re-dosed\s+no/);
  });

  it('refuses a machine the load will not fit and says why', async () => {
    const io = capture();
    expect(await run(['plan', '-w', works, '-r', recipe, '-g', lots, '-m', 'JIG-2'], io)).toBe(3);
    expect(io.err.text()).toMatch(/does not fit JIG-2: above-maximum/);
  });

  it('refuses a machine that is not in the register', async () => {
    const io = capture();
    expect(await run(['plan', '-w', works, '-r', recipe, '-g', lots, '-m', 'JET-9'], io)).toBe(4);
    expect(io.err.text()).toMatch(/not in the machine register/);
  });

  it('prints json for a script', async () => {
    const io = capture();
    await run(
      ['plan', '-w', works, '-r', recipe, '-g', lots, '-m', 'JET-4', '--format', 'json'],
      io
    );
    const batch = JSON.parse(io.out.text());
    expect(batch.machineId).toBe('JET-4');
    expect(batch.lotIds).toHaveLength(3);
    expect(batch.card.lines.length).toBeGreaterThan(4);
  });

  it('carries the batch number it was given', async () => {
    const io = capture();
    await run(
      [
        'plan',
        '-w',
        works,
        '-r',
        recipe,
        '-g',
        lots,
        '-m',
        'JET-4',
        '-b',
        'B25-00301',
        '--format',
        'json',
      ],
      io
    );
    expect(JSON.parse(io.out.text()).id).toBe('B25-00301');
  });

  it('refuses a lots file with no cloth in it', async () => {
    const io = capture();
    const empty = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
    expect(await run(['plan', '-w', works, '-r', recipe, '-g', empty], io)).toBe(4);
  });
});

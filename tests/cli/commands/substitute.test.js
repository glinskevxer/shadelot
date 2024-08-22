import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

describe('the substitute command', () => {
  it('describes the article that ran out', async () => {
    const io = capture();
    expect(await run(['substitute', '-w', works, '-c', 'RB-19-ACME'], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/article\s+RB-19-ACME/);
    expect(text).toMatch(/colour index\s+RB19/);
  });

  it('proposes the other house at the same colour index', async () => {
    const io = capture();
    await run(['substitute', '-w', works, '-c', 'RB-19-ACME'], io);
    expect(io.out.text()).toMatch(/RB-19-NORD/);
    expect(io.out.text()).toMatch(/lab-check/);
  });

  it('warns when nothing on the list is a direct swap', async () => {
    const io = capture();
    await run(['substitute', '-w', works, '-c', 'RB-19-ACME'], io);
    expect(io.out.text()).toMatch(/every one needs a lab dip first/);
  });

  it('says so plainly when nothing shares the index', async () => {
    const io = capture();
    await run(['substitute', '-w', works, '-c', 'DB-56-ACME'], io);
    expect(io.out.text()).toMatch(/nothing in the catalogue shares this colour index/);
  });

  it('converts a dose at the strength factor when one is given', async () => {
    const io = capture();
    await run(
      ['substitute', '-w', works, '-c', 'RB-19-ACME', '--dose', '0.68', '--format', 'json'],
      io
    );
    const result = JSON.parse(io.out.text());
    const nord = result.candidates.find((row) => row.code === 'RB-19-NORD');
    expect(nord.dose).toBeCloseTo(0.68 * (100 / 133), 6);
  });

  it('leaves the dose out when none is given', async () => {
    const io = capture();
    await run(['substitute', '-w', works, '-c', 'RB-19-ACME', '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).candidates[0].dose).toBeNull();
  });

  it('drops a candidate under a fastness floor', async () => {
    const io = capture();
    await run(
      ['substitute', '-w', works, '-c', 'RB-19-ACME', '--fastness', 'rubWet=3', '--format', 'json'],
      io
    );
    const codes = JSON.parse(io.out.text()).candidates.map((row) => row.code);
    expect(codes).not.toContain('RB-19-NORD');
  });

  it('shows it again with the reason when asked for everything', async () => {
    const io = capture();
    await run(
      [
        'substitute',
        '-w',
        works,
        '-c',
        'RB-19-ACME',
        '--fastness',
        'rubWet=3',
        '--all',
        '--format',
        'json',
      ],
      io
    );
    const row = JSON.parse(io.out.text()).candidates.find((r) => r.code === 'RB-19-NORD');
    expect(row.confidence).toBe('unsuitable');
    expect(row.reason).toMatch(/rubWet fastness is 2/);
  });

  it('refuses a fastness flag it cannot read', async () => {
    const io = capture();
    expect(
      await run(['substitute', '-w', works, '-c', 'RB-19-ACME', '--fastness', 'wash'], io)
    ).toBe(2);
    expect(io.err.text()).toMatch(/wants something like wash=4/);
  });

  it('refuses an article the works does not stock', async () => {
    const io = capture();
    expect(await run(['substitute', '-w', works, '-c', 'RB-99'], io)).toBe(4);
    expect(io.err.text()).toMatch(/not in the catalogue/);
  });
});

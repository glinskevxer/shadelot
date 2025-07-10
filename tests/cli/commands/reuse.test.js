import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const pale = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
const deep = fileURLToPath(new URL('../../../examples/recipe-olive-deep.json', import.meta.url));
const library = fileURLToPath(new URL('../../../examples/recipe-library.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

describe('the reuse command', () => {
  it('reuses the bath going darker in one family', async () => {
    const io = capture();
    expect(await run(['reuse', '-w', works, '--previous', pale, '--next', deep], io)).toBe(0);
    expect(io.out.text()).toMatch(/verdict\s+reuse/);
  });

  it('asks for a correction when the bath still carries dye', async () => {
    const io = capture();
    await run(['reuse', '-w', works, '--previous', pale, '--next', deep, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).assessment.verdict).toBe('reuse-with-correction');
  });

  it('drops the bath going lighter', async () => {
    const io = capture();
    await run(['reuse', '-w', works, '--previous', deep, '--next', pale, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).assessment.verdict).toBe('drop');
  });

  it('drops it once it has been round enough times', async () => {
    const io = capture();
    await run(
      [
        'reuse',
        '-w',
        works,
        '--previous',
        pale,
        '--next',
        deep,
        '--reuses',
        '3',
        '--format',
        'json',
      ],
      io
    );
    expect(JSON.parse(io.out.text()).assessment.reason).toMatch(/already been reused/);
  });

  it('prints the saving alongside the verdict', async () => {
    const io = capture();
    await run(['reuse', '-w', works, '--previous', pale, '--next', deep], io);
    expect(io.out.text()).toMatch(/saves\s+[\d.]+ cubic metres/);
    expect(io.out.text()).toMatch(/worth\s+£/);
  });

  it('leaves more dye in the bath at a poorer fixation', async () => {
    const good = capture();
    await run(['reuse', '-w', works, '--previous', pale, '--next', deep, '--format', 'json'], good);
    const poor = capture();
    await run(
      [
        'reuse',
        '-w',
        works,
        '--previous',
        pale,
        '--next',
        deep,
        '--fixation',
        '0.4',
        '--format',
        'json',
      ],
      poor
    );
    expect(JSON.parse(poor.out.text()).residual.dyeOwf).toBeGreaterThan(
      JSON.parse(good.out.text()).residual.dyeOwf
    );
  });

  it('takes the corrected charge off the next recipe', async () => {
    const io = capture();
    await run(['reuse', '-w', works, '--previous', pale, '--next', deep, '--format', 'json'], io);
    const charge = JSON.parse(io.out.text()).charge;
    expect(charge).toHaveLength(3);
    for (const line of charge) {
      expect(line.owf).toBeLessThan(2.5);
      expect(line.fromBath).toBeGreaterThan(0);
    }
  });

  it('prints no charge table for a bath it says to drop', async () => {
    const io = capture();
    await run(['reuse', '-w', works, '--previous', deep, '--next', pale, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).charge).toEqual([]);
  });

  it('walks a chain of recipes when it is given one', async () => {
    const io = capture();
    await run(
      [
        'reuse',
        '-w',
        works,
        '--previous',
        pale,
        '--next',
        deep,
        '--chain',
        library,
        '--format',
        'json',
      ],
      io
    );
    const chain = JSON.parse(io.out.text()).chain;
    expect(chain[0]).toBe('R25-00081');
    expect(chain.length).toBeGreaterThanOrEqual(1);
  });

  it('says which recipe in the chain is unusable', async () => {
    const io = capture();
    expect(
      await run(['reuse', '-w', works, '--previous', pale, '--next', deep, '--chain', works], io)
    ).toBe(4);
  });

  it('needs both recipes', async () => {
    const io = capture();
    expect(await run(['reuse', '-w', works, '--previous', pale], io)).toBe(2);
    expect(io.err.text()).toMatch(/--next/);
  });
});

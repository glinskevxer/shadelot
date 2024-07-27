import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const recipe = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

describe('the card command', () => {
  it('prints a card for the shipped example', async () => {
    const io = capture();
    expect(await run(['card', '-w', works, '-r', recipe, '-l', '200'], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/R25-00081/);
    expect(text).toMatch(/bath\s+1600 litres at 8.0 to 1/);
    expect(text).toMatch(/RY-145-ACME/);
  });

  it('puts the works salt and alkali on the card', async () => {
    const io = capture();
    await run(['card', '-w', works, '-r', recipe, '-l', '200'], io);
    expect(io.out.text()).toMatch(/NACL-IND/);
    expect(io.out.text()).toMatch(/NA2CO3/);
  });

  it('leaves them off when told to', async () => {
    const io = capture();
    await run(['card', '-w', works, '-r', recipe, '-l', '200', '--no-electrolyte'], io);
    expect(io.out.text()).not.toMatch(/NACL-IND/);
  });

  it('prints json a script can read', async () => {
    const io = capture();
    await run(['card', '-w', works, '-r', recipe, '-l', '200', '--format', 'json'], io);
    const card = JSON.parse(io.out.text());
    expect(card.fibreKg).toBe(200);
    expect(card.litres).toBe(1600);
    expect(card.lines.length).toBeGreaterThan(5);
    expect(card.cost).toBeGreaterThan(0);
  });

  it('scales with the load', async () => {
    const readDye = async (load) => {
      const io = capture();
      await run(['card', '-w', works, '-r', recipe, '-l', load, '--format', 'json'], io);
      const card = JSON.parse(io.out.text());
      return card.lines
        .filter((line) => line.kind === 'dye')
        .reduce((sum, line) => sum + line.exactKg, 0);
    };
    const small = await readDye('100');
    const large = await readDye('200');
    expect(large).toBeCloseTo(small * 2, 9);
  });

  it('refuses a load that is not a positive number', async () => {
    const io = capture();
    expect(await run(['card', '-w', works, '-r', recipe, '-l', '0'], io)).toBe(4);
    expect(io.err.text()).toMatch(/--load must be greater than zero/);
  });

  it('says which file is missing', async () => {
    const io = capture();
    expect(await run(['card', '-w', '/nope/works.json', '-r', recipe, '-l', '200'], io)).toBe(3);
    expect(io.err.text()).toMatch(/works file .* is not there/);
  });

  it('reports a recipe naming a dye the works does not stock', async () => {
    const io = capture();
    const bad = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
    expect(await run(['card', '-w', works, '-r', bad, '-l', '200'], io)).toBe(0);
  });

  it('needs every required flag', async () => {
    const io = capture();
    expect(await run(['card', '-w', works, '-l', '200'], io)).toBe(2);
    expect(io.err.text()).toMatch(/--recipe/);
  });
});

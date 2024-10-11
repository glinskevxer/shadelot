import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const recipe = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
const profile = fileURLToPath(
  new URL('../../../examples/profile-reactive-60.json', import.meta.url)
);
const capture = () => ({ out: createOutput(), err: createOutput() });
const base = ['cost', '-w', works, '-r', recipe, '-m', 'JET-4', '-l', '200'];

describe('the cost command', () => {
  it('prices a batch and prints every head', async () => {
    const io = capture();
    expect(await run(base, io)).toBe(0);
    const text = io.out.text();
    for (const head of ['dyestuff', 'chemical', 'water', 'energy', 'labour', 'overhead']) {
      expect(text).toMatch(new RegExp(`^${head}`, 'm'));
    }
  });

  it('puts the per saleable kilogram figure at the bottom', async () => {
    const io = capture();
    await run(base, io);
    expect(io.out.text().trimEnd().split('\n').slice(-3).join('\n')).toMatch(/per kilo saleable/);
  });

  it('reads the energy off a profile when one is given', async () => {
    const withProfile = capture();
    await run([...base, '-p', profile, '--format', 'json'], withProfile);
    const withoutProfile = capture();
    await run([...base, '--format', 'json'], withoutProfile);
    expect(JSON.parse(withProfile.out.text()).heads.energy).toBeGreaterThan(
      JSON.parse(withoutProfile.out.text()).heads.energy
    );
  });

  it('charges a second pass on top', async () => {
    const one = capture();
    await run([...base, '--format', 'json'], one);
    const two = capture();
    await run([...base, '--passes', '2', '--format', 'json'], two);
    expect(JSON.parse(two.out.text()).total).toBeCloseTo(JSON.parse(one.out.text()).total * 2, 6);
  });

  it('divides by what came out saleable when told', async () => {
    const io = capture();
    await run([...base, '--saleable', '180', '--format', 'json'], io);
    const costing = JSON.parse(io.out.text());
    expect(costing.perKgSaleable).toBeGreaterThan(costing.perKgCharged);
    expect(costing.yield).toBeCloseTo(0.9, 9);
  });

  it('uses more water with more rinses', async () => {
    const few = capture();
    await run([...base, '--rinses', '1', '--format', 'json'], few);
    const many = capture();
    await run([...base, '--rinses', '5', '--format', 'json'], many);
    expect(JSON.parse(many.out.text()).waterNet).toBeGreaterThan(
      JSON.parse(few.out.text()).waterNet
    );
    expect(JSON.parse(many.out.text()).heads.water).toBeGreaterThan(
      JSON.parse(few.out.text()).heads.water
    );
  });

  it('reads the bath volume off the machine rather than the recipe', async () => {
    const io = capture();
    await run([...base, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).litres).toBe(900 + 3.5 * 200);
  });

  it('refuses a machine that is not in the register', async () => {
    const io = capture();
    expect(await run(['cost', '-w', works, '-r', recipe, '-m', 'JET-9', '-l', '200'], io)).toBe(4);
  });

  it('needs every required flag', async () => {
    const io = capture();
    expect(await run(['cost', '-w', works, '-r', recipe, '-l', '200'], io)).toBe(2);
    expect(io.err.text()).toMatch(/--machine/);
  });
});

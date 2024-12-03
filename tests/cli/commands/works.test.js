import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { parts } from '../../../src/cli/commands/works.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

describe('the works command', () => {
  it('summarises the plant', async () => {
    const io = capture();
    expect(await run(['works', '-w', works], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/works\s+Redgate Dyeing Company/);
    expect(text).toMatch(/machines\s+5/);
  });

  it('says whether the tariff and the consent are there', async () => {
    const io = capture();
    await run(['works', '-w', works], io);
    expect(io.out.text()).toMatch(/tariff\s+present/);
    expect(io.out.text()).toMatch(/consent\s+trade effluent consent/);
  });

  it('prints the liquor ratio band each machine can reach', async () => {
    const io = capture();
    await run(['works', '-w', works, '--only', 'machines', '--format', 'json'], io);
    const machines = JSON.parse(io.out.text()).machines;
    for (const machine of machines) {
      expect(machine.tightest).toBeLessThan(machine.loosest);
    }
  });

  it('narrows to one part when asked', async () => {
    const io = capture();
    await run(['works', '-w', works, '--only', 'chemicals'], io);
    expect(io.out.text()).toMatch(/NACL-IND/);
    expect(io.out.text()).not.toMatch(/JET-4/);
  });

  it('lists the tolerance blocks when that part is asked for', async () => {
    const io = capture();
    await run(['works', '-w', works, '--only', 'tolerances'], io);
    expect(io.out.text()).toMatch(/kestrel shirting/);
    expect(parts).toContain('tolerances');
  });

  it('prints the whole plant as json in one document', async () => {
    const io = capture();
    await run(['works', '-w', works, '--format', 'json'], io);
    const document = JSON.parse(io.out.text());
    expect(document.machines).toHaveLength(5);
    expect(document.dyes.length).toBeGreaterThan(3);
    expect(document.tolerances.length).toBeGreaterThan(1);
  });

  it('says which file is missing', async () => {
    const io = capture();
    expect(await run(['works', '-w', '/nope.json'], io)).toBe(3);
  });
});

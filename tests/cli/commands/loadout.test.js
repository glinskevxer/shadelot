import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const lots = fileURLToPath(new URL('../../../examples/lots.json', import.meta.url));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-loadout-'));
});

const lotsFile = async (name, rows) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(rows), 'utf8');
  return path;
};

describe('the loadout command', () => {
  it('places the shipped lots on separate machines', async () => {
    const io = capture();
    expect(await run(['loadout', '-w', works, '-g', lots, '--format', 'json'], io)).toBe(0);
    const plan = JSON.parse(io.out.text());
    expect(plan.placed).toHaveLength(3);
    expect(new Set(plan.placed.map((row) => row.machineId)).size).toBe(3);
  });

  it('shows the compromise under the table', async () => {
    const io = capture();
    await run(['loadout', '-w', works, '-g', lots], io);
    expect(io.out.text()).toMatch(/mean fill\s+\d+\.\d%/);
    expect(io.out.text()).toMatch(/worst ratio miss\s+\d+\.\d%/);
  });

  it('leans on fill when the weighting says to', async () => {
    const balanced = capture();
    await run(['loadout', '-w', works, '-g', lots, '--format', 'json'], balanced);
    const filled = capture();
    await run(
      ['loadout', '-w', works, '-g', lots, '--fill-weight', '1', '--format', 'json'],
      filled
    );
    expect(JSON.parse(filled.out.text()).meanFill).toBeGreaterThanOrEqual(
      JSON.parse(balanced.out.text()).meanFill
    );
  });

  it('leaves an excluded machine out and says which are idle', async () => {
    const io = capture();
    await run(['loadout', '-w', works, '-g', lots, '--exclude', 'JET-4', '--format', 'json'], io);
    const plan = JSON.parse(io.out.text());
    expect(plan.placed.map((row) => row.machineId)).not.toContain('JET-4');
    expect(plan.idle).not.toContain('JET-4');
  });

  it('refuses to exclude a machine that is not in the register', async () => {
    const io = capture();
    expect(await run(['loadout', '-w', works, '-g', lots, '--exclude', 'JET-9'], io)).toBe(4);
  });

  it('refuses to exclude everything', async () => {
    const io = capture();
    const all = ['JET-4', 'JET-5', 'WIN-1', 'JIG-2', 'PAD-1'].flatMap((id) => ['--exclude', id]);
    expect(await run(['loadout', '-w', works, '-g', lots, ...all], io)).toBe(4);
    expect(io.err.text()).toMatch(/every machine .* is excluded/);
  });

  it('reports a lot it could not place and why', async () => {
    const io = capture();
    const tiny = await lotsFile('tiny.json', [{ id: 'G1', mass: 3 }]);
    await run(['loadout', '-w', works, '-g', tiny, '--format', 'json'], io);
    const plan = JSON.parse(io.out.text());
    expect(plan.placed).toEqual([]);
    expect(plan.unplaced[0].reason).toMatch(/under every machine minimum/);
  });

  it('splits an oversize lot when it is told to', async () => {
    const huge = await lotsFile('huge.json', [{ id: 'G1', mass: 1400 }]);
    const without = capture();
    await run(['loadout', '-w', works, '-g', huge, '--format', 'json'], without);
    expect(JSON.parse(without.out.text()).unplaced).toHaveLength(1);
    expect(JSON.parse(without.out.text()).placed).toEqual([]);

    const io = capture();
    await run(['loadout', '-w', works, '-g', huge, '--split', '--format', 'json'], io);
    const plan = JSON.parse(io.out.text());
    expect(plan.placed.length).toBeGreaterThan(0);
    expect(plan.placed.map((row) => row.lotId)).toContain('G1-1');
  });

  it('refuses an empty lots file', async () => {
    const io = capture();
    const empty = await lotsFile('empty.json', []);
    expect(await run(['loadout', '-w', works, '-g', empty], io)).toBe(4);
  });

  it('says which lot is short of a mass', async () => {
    const io = capture();
    const broken = await lotsFile('broken.json', [{ id: 'G1' }]);
    expect(await run(['loadout', '-w', works, '-g', broken], io)).toBe(4);
    expect(io.err.text()).toMatch(/lot 0 in the lots file needs an id and a mass/);
  });

  it('is the same plan on the same inputs', async () => {
    const first = capture();
    await run(['loadout', '-w', works, '-g', lots, '--format', 'json'], first);
    const second = capture();
    await run(['loadout', '-w', works, '-g', lots, '--format', 'json'], second);
    expect(first.out.text()).toBe(second.out.text());
  });
});

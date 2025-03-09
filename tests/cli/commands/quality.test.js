import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const rollPath = fileURLToPath(new URL('../../../examples/roll-faults.json', import.meta.url));
const roll = JSON.parse(readFileSync(rollPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-quality-'));
});

const rollFile = async (name, document) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(document), 'utf8');
  return path;
};

describe('the quality command', () => {
  it('grades the shipped roll a first', async () => {
    const io = capture();
    expect(await run(['quality', '-r', rollPath], io)).toBe(0);
    expect(io.out.text()).toMatch(/grade\s+first/);
  });

  it('lists every fault with where to find it', async () => {
    const io = capture();
    await run(['quality', '-r', rollPath], io);
    expect(io.out.text()).toMatch(/62\.0 m/);
    expect(io.out.text()).toMatch(/rope mark, jet 4/);
  });

  it('splits the points by cause and says which are ours', async () => {
    const io = capture();
    await run(['quality', '-r', rollPath, '--format', 'json'], io);
    const causes = JSON.parse(io.out.text()).causes;
    expect(causes.find((row) => row.cause === 'dyeing').ours).toBe('yes');
    expect(causes.find((row) => row.cause === 'weaving').ours).toBe('no');
  });

  it('reports our share of the points, not of the faults', async () => {
    const io = capture();
    await run(['quality', '-r', rollPath], io);
    expect(io.out.text()).toMatch(/our share\s+\d+\.\d%/);
  });

  it('leaves with the out of tolerance code for a second', async () => {
    const io = capture();
    const bad = await rollFile('bad.json', {
      ...roll,
      lengthMetres: 20,
      faults: Array.from({ length: 20 }, (_, i) => ({
        atMetres: i + 1,
        kind: 'stain',
        lengthCm: 30,
        cause: 'dyeing',
      })),
    });
    expect(await run(['quality', '-r', bad], io)).toBe(5);
    expect(io.err.text()).toMatch(/grades a second at/);
  });

  it('takes a tighter limit from a fussy customer', async () => {
    const io = capture();
    expect(await run(['quality', '-r', rollPath, '--limit', '0.1'], io)).toBe(5);
  });

  it('reads the barre risk when the file carries the beams', async () => {
    const io = capture();
    await run(['quality', '-r', rollPath], io);
    expect(io.out.text()).toMatch(/barre risk\s+none/);
  });

  it('says so when it does not', async () => {
    const io = capture();
    const plain = await rollFile('plain.json', { ...roll, rolls: undefined });
    await run(['quality', '-r', plain], io);
    expect(io.out.text()).toMatch(/no beam data on the file/);
  });

  it('takes a clean roll with no faults at all', async () => {
    const io = capture();
    const clean = await rollFile('clean.json', { ...roll, faults: [] });
    expect(await run(['quality', '-r', clean, '--format', 'json'], io)).toBe(0);
    expect(JSON.parse(io.out.text()).score).toBe(0);
  });

  it('says which field the roll file is short of', async () => {
    const io = capture();
    const broken = await rollFile('broken.json', { id: 'R-1', lengthMetres: 100 });
    expect(await run(['quality', '-r', broken], io)).toBe(4);
    expect(io.err.text()).toMatch(/the roll file has no widthCm/);
  });

  it('says which fault is unusable', async () => {
    const io = capture();
    const broken = await rollFile('broken.json', {
      ...roll,
      faults: [{ atMetres: 1, kind: 'wrinkle', lengthCm: 3 }],
    });
    expect(await run(['quality', '-r', broken], io)).toBe(4);
    expect(io.err.text()).toMatch(/fault 0 on R-1204 is not usable/);
  });
});

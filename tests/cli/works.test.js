import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assembleWorks,
  loadWorks,
  resolveTolerance,
  toleranceNamed,
  worksIfNamed,
} from '../../src/cli/works.js';

const document = JSON.parse(
  readFileSync(new URL('../../examples/works.json', import.meta.url), 'utf8')
);

describe('the shipped example works', () => {
  const works = assembleWorks(document, 'examples/works.json');

  it('carries the dyes, the chemicals and the machines', () => {
    expect(works.catalogue.size).toBeGreaterThan(3);
    expect(works.chemicals.size).toBeGreaterThan(5);
    expect(works.machines.size).toBe(5);
  });

  it('names the two electrolytes the works doses by default', () => {
    expect(works.chemicals.has(works.saltCode)).toBe(true);
    expect(works.chemicals.has(works.alkaliCode)).toBe(true);
  });

  it('carries a tariff and a consent for the costing commands', () => {
    expect(works.tariff.waterPerCubicMetre).toBeGreaterThan(0);
    expect(works.consent.codKg).toBeGreaterThan(0);
  });

  it('holds the tolerance blocks by name', () => {
    expect(toleranceNamed(works, 'kestrel shirting').total).toBe(1);
    expect(toleranceNamed(works, null)).toBeNull();
  });

  it('says which blocks it has when one is misnamed', () => {
    expect(() => toleranceNamed(works, 'kestrel')).toThrow(
      /it has kestrel shirting, works default/
    );
  });
});

describe('a works file that is wrong', () => {
  it('says which list is missing', () => {
    expect(() => assembleWorks({ chemicals: [], machines: [] }, 'w.json')).toThrow(
      /must carry a dyestuffs array/
    );
    expect(() => assembleWorks({ dyestuffs: [], machines: [] }, 'w.json')).toThrow(
      /chemicals array/
    );
    expect(() => assembleWorks({ dyestuffs: [], chemicals: [] }, 'w.json')).toThrow(
      /machines array/
    );
  });

  it('says which row of which list is wrong', () => {
    const bad = { ...document, machines: [...document.machines, { id: 'X', type: 'kier' }] };
    expect(() => assembleWorks(bad, 'w.json')).toThrow(/machines\[5\] is not usable/);
  });

  it('carries the underlying complaint through', () => {
    const bad = {
      ...document,
      chemicals: [{ code: 'X', name: 'x', role: 'salt', basis: 'gpl', pricePerKg: 0 }],
    };
    expect(() => assembleWorks(bad, 'w.json')).toThrow(/pricePerKg/);
  });

  it('takes a works with no tolerances at all', () => {
    const works = assembleWorks({ ...document, tolerances: undefined }, 'w.json');
    expect(works.tolerances.size).toBe(0);
    expect(() => toleranceNamed(works, 'anything')).toThrow(/it has none/);
  });
});

describe('loading one off disk', () => {
  it('reads the shipped example', async () => {
    const works = await loadWorks(new URL('../../examples/works.json', import.meta.url).pathname);
    expect(works.name).toBe('Redgate Dyeing Company');
  });

  it('says the works file is missing rather than throwing a bare error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadelot-works-'));
    await expect(loadWorks(join(directory, 'nope.json'))).rejects.toThrow(
      /works file .* is not there/
    );
  });

  it('refuses a works file holding an array', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadelot-works-'));
    const path = join(directory, 'works.json');
    await writeFile(path, '[]', 'utf8');
    await expect(loadWorks(path)).rejects.toThrow(/must hold an object/);
  });
});

describe('resolving what a command should judge under', () => {
  const path = fileURLToPath(new URL('../../examples/works.json', import.meta.url));
  const fallback = { name: 'fallback', total: 1, formula: 'cmc' };

  it('takes the fallback when no block is named', async () => {
    const resolved = await resolveTolerance({}, fallback);
    expect(resolved.block).toBe(fallback);
    expect(resolved.works).toBeNull();
  });

  it('loads the works file exactly once when a block is named', async () => {
    const resolved = await resolveTolerance({ works: path, tolerance: 'workwear' }, fallback);
    expect(resolved.block.name).toBe('workwear');
    expect(resolved.works.name).toBe('Redgate Dyeing Company');
  });

  it('reports a missing works file as bad data, the same as every other command', async () => {
    await expect(resolveTolerance({ tolerance: 'workwear' }, fallback)).rejects.toMatchObject({
      exitCode: 4,
    });
  });

  it('says which blocks exist when one is misnamed', async () => {
    await expect(resolveTolerance({ works: path, tolerance: 'nope' }, fallback)).rejects.toThrow(
      /no tolerance called "nope"/
    );
  });

  it('loads the works file for a command that needs it for another reason', async () => {
    const works = await worksIfNamed({ works: path }, { because: 'naming a machine' });
    expect(works.machines.size).toBe(5);
  });

  it('says what needed it when it is not there', async () => {
    await expect(worksIfNamed({}, { because: 'naming a machine' })).rejects.toThrow(
      /naming a machine needs the works file/
    );
  });
});

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { listBackups, readBackup } from '../../src/store/backup.js';
import {
  SHAPES,
  census,
  commit,
  danglingReferences,
  drop,
  fetch,
  list,
  open,
  shapeOf,
  store,
  toRecord,
} from '../../src/store/repository.js';

let directory;
let path;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-repo-'));
  path = join(directory, 'works.json');
});

describe('the shapes', () => {
  it('name one field list per collection', () => {
    expect(Object.keys(SHAPES)).toContain('batches');
    expect(shapeOf('recipes')).toContain('liquorRatio');
  });

  it('refuse a collection nothing stores', () => {
    expect(() => shapeOf('invoices')).toThrow(/must be one of rolls/);
  });

  it('drop a derived field rather than storing it', () => {
    const record = toRecord('recipes', {
      id: 'R1',
      name: 'olive',
      process: 'exhaust',
      substrate: 'cotton',
      liquorRatio: 8,
      dyes: [],
      auxiliaries: [],
      totalOwf: 1.8,
      band: 'medium',
    });
    expect(record.totalOwf).toBeUndefined();
    expect(record.band).toBeUndefined();
    expect(record.liquorRatio).toBe(8);
  });

  it('leave out a field the value does not carry rather than writing undefined', () => {
    const record = toRecord('rolls', { id: 'R-1', quality: 'poplin' });
    expect(Object.keys(record)).toEqual(['id', 'quality']);
  });

  it('refuse a record with no identifier', () => {
    expect(() => toRecord('recipes', { name: 'olive' })).toThrow(/recipes.id/);
  });
});

describe('opening and committing', () => {
  it('opens an empty repository for a file that is not there', async () => {
    const repository = await open(path);
    expect(census(repository).every((row) => row.count === 0)).toBe(true);
    expect(repository.dirty).toBe(false);
  });

  it('writes nothing when nothing changed', async () => {
    const repository = await open(path);
    expect((await commit(repository)).written).toBe(false);
    await expect(readFile(path, 'utf8')).rejects.toThrow();
  });

  it('writes once something is stored', async () => {
    const repository = await open(path);
    store(repository, 'recipes', { id: 'R1', name: 'olive', liquorRatio: 8 });
    expect(repository.dirty).toBe(true);
    expect((await commit(repository)).written).toBe(true);
    expect(repository.dirty).toBe(false);
  });

  it('reads back what it wrote', async () => {
    const first = await open(path);
    store(first, 'recipes', { id: 'R1', name: 'olive', liquorRatio: 8 });
    await commit(first);
    const second = await open(path);
    expect(fetch(second, 'recipes', 'R1').name).toBe('olive');
  });

  it('replaces a record with the same identifier', async () => {
    const repository = await open(path);
    store(repository, 'recipes', { id: 'R1', name: 'olive' });
    store(repository, 'recipes', { id: 'R1', name: 'olive dark' });
    expect(list(repository, 'recipes')).toHaveLength(1);
    expect(fetch(repository, 'recipes', 'R1').name).toBe('olive dark');
  });

  it('drops a record and reports whether it was there', async () => {
    const repository = await open(path);
    store(repository, 'recipes', { id: 'R1', name: 'olive' });
    expect(drop(repository, 'recipes', 'R1')).toBe(true);
    expect(drop(repository, 'recipes', 'R1')).toBe(false);
    expect(fetch(repository, 'recipes', 'R1')).toBeNull();
  });

  it('filters a listing', async () => {
    const repository = await open(path);
    store(repository, 'batches', { id: 'B1', machineId: 'JET-4' });
    store(repository, 'batches', { id: 'B2', machineId: 'JET-5' });
    expect(list(repository, 'batches', (row) => row.machineId === 'JET-4')).toHaveLength(1);
  });

  it('refuses a collection nothing stores on every entry point', async () => {
    const repository = await open(path);
    expect(() => store(repository, 'invoices', { id: 'I1' })).toThrow(/collection/);
    expect(() => fetch(repository, 'invoices', 'I1')).toThrow(/collection/);
    expect(() => list(repository, 'invoices')).toThrow(/collection/);
    expect(() => drop(repository, 'invoices', 'I1')).toThrow(/collection/);
  });
});

describe('the census', () => {
  it('counts every collection whether or not it holds anything', async () => {
    const repository = await open(path);
    store(repository, 'recipes', { id: 'R1', name: 'olive' });
    const rows = census(repository);
    expect(rows.find((row) => row.collection === 'recipes').count).toBe(1);
    expect(rows.find((row) => row.collection === 'batches').count).toBe(0);
  });
});

describe('dangling references', () => {
  it('finds nothing in a consistent file', async () => {
    const repository = await open(path);
    store(repository, 'rolls', { id: 'R-1', quality: 'poplin' });
    store(repository, 'lots', { id: 'G1', customer: 'K', rollIds: ['R-1'] });
    expect(danglingReferences(repository)).toEqual([]);
  });

  it('names a lot pointing at a roll that is gone', async () => {
    const repository = await open(path);
    store(repository, 'lots', { id: 'G1', customer: 'K', rollIds: ['R-1', 'R-2'] });
    const dangling = danglingReferences(repository);
    expect(dangling).toHaveLength(2);
    expect(dangling[0]).toEqual({ collection: 'lots', id: 'G1', missing: 'R-1', kind: 'roll' });
  });

  it('names a batch pointing at a recipe that is gone', async () => {
    const repository = await open(path);
    store(repository, 'batches', { id: 'B1', recipeId: 'R9' });
    expect(danglingReferences(repository)[0].kind).toBe('recipe');
  });

  it('takes a lot carrying no roll list at all', async () => {
    const repository = await open(path);
    store(repository, 'lots', { id: 'G1', customer: 'K' });
    expect(danglingReferences(repository)).toEqual([]);
  });
});

describe('backups around a write', () => {
  const at = (iso) => () => new Date(iso);

  it('takes no copy on the first write, because there was nothing there', async () => {
    const repository = await open(path);
    store(repository, 'recipes', { id: 'R1', name: 'olive' });
    const result = await commit(repository, { now: at('2025-04-02T09:00:00Z') });
    expect(result.written).toBe(true);
    expect(result.backedUp).toBeNull();
  });

  it('takes one before the second write', async () => {
    const first = await open(path);
    store(first, 'recipes', { id: 'R1', name: 'olive' });
    await commit(first);

    const second = await open(path);
    store(second, 'recipes', { id: 'R2', name: 'navy' });
    const result = await commit(second, { now: at('2025-04-02T09:00:00Z') });
    expect(result.backedUp).toMatch(/works\.json\.20250402T090000\.bak$/);
  });

  it('backs up what was there and not what it just wrote', async () => {
    const first = await open(path);
    store(first, 'recipes', { id: 'R1', name: 'olive' });
    await commit(first);

    const second = await open(path);
    store(second, 'recipes', { id: 'R2', name: 'navy' });
    const result = await commit(second, { now: at('2025-04-02T09:00:00Z') });
    const copy = await readBackup(result.backedUp);
    expect(copy.recipes.map((row) => row.id)).toEqual(['R1']);
  });

  it('takes nothing when nothing changed', async () => {
    const first = await open(path);
    store(first, 'recipes', { id: 'R1', name: 'olive' });
    await commit(first);
    const second = await open(path);
    const result = await commit(second);
    expect(result.written).toBe(false);
    expect(result.backedUp).toBeNull();
    expect(await listBackups(path)).toEqual([]);
  });

  it('prunes to the keep count as it goes', async () => {
    const seed = await open(path);
    store(seed, 'recipes', { id: 'R0', name: 'seed' });
    await commit(seed);
    for (let day = 1; day <= 5; day += 1) {
      const repository = await open(path, { keep: 2 });
      store(repository, 'recipes', { id: `R${day}`, name: `r${day}` });
      await commit(repository, { now: at(`2025-04-0${day}T09:00:00Z`) });
    }
    expect(await listBackups(path)).toHaveLength(2);
  });

  it('can be turned off for a caller that does its own', async () => {
    const first = await open(path);
    store(first, 'recipes', { id: 'R1', name: 'olive' });
    await commit(first);
    const second = await open(path, { backups: false });
    store(second, 'recipes', { id: 'R2', name: 'navy' });
    const result = await commit(second);
    expect(result.backedUp).toBeNull();
    expect(await listBackups(path)).toEqual([]);
  });
});

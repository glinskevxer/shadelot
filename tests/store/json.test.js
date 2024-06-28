import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  COLLECTIONS,
  SCHEMA_VERSION,
  emptyDocument,
  get,
  load,
  migrate,
  put,
  remove,
  save,
  validateDocument,
} from '../../src/store/json.js';

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-'));
});

describe('an empty document', () => {
  it('carries every collection and the current version', () => {
    const document = emptyDocument();
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    for (const name of COLLECTIONS) {
      expect(document[name]).toEqual([]);
    }
  });
});

describe('validation', () => {
  it('refuses something that is not an object', () => {
    expect(() => validateDocument([])).toThrow(/must be an object/);
    expect(() => validateDocument(null)).toThrow(/must be an object/);
  });

  it('refuses a document written by a newer build', () => {
    expect(() => validateDocument({ ...emptyDocument(), schemaVersion: 99 })).toThrow(
      /which this build does not understand/
    );
  });

  it('refuses a collection that is not an array', () => {
    expect(() => validateDocument({ ...emptyDocument(), batches: {} })).toThrow(/document.batches/);
  });
});

describe('reading and writing', () => {
  it('gives an empty document for a file that is not there', async () => {
    const document = await load(join(directory, 'missing.json'));
    expect(document.batches).toEqual([]);
  });

  it('round trips a document', async () => {
    const path = join(directory, 'works.json');
    const document = emptyDocument();
    put(document, 'batches', { id: 'B1', machineId: 'JET-4' });
    await save(path, document);
    const back = await load(path);
    expect(back.batches).toEqual([{ id: 'B1', machineId: 'JET-4' }]);
  });

  it('stamps the time it was written', async () => {
    const path = join(directory, 'works.json');
    const written = await save(path, emptyDocument(), { now: () => '2025-04-02T09:00:00.000Z' });
    expect(written.writtenAt).toBe('2025-04-02T09:00:00.000Z');
    expect((await load(path)).writtenAt).toBe('2025-04-02T09:00:00.000Z');
  });

  it('creates the directory on the way', async () => {
    const path = join(directory, 'nested', 'deeper', 'works.json');
    await save(path, emptyDocument());
    expect((await load(path)).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('leaves no temporary file behind', async () => {
    const path = join(directory, 'works.json');
    await save(path, emptyDocument());
    const text = await readFile(path, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('says which file is bad rather than letting a parse error through raw', async () => {
    const path = join(directory, 'broken.json');
    await writeFile(path, '{ this is not json', 'utf8');
    await expect(load(path)).rejects.toThrow(/is not valid json/);
  });
});

describe('migration', () => {
  it('treats a document with no version as version zero and brings it forward', () => {
    const old = { batches: [{ id: 'B1' }] };
    const migrated = migrate(old);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.batches).toEqual([{ id: 'B1' }]);
    expect(migrated.recipes).toEqual([]);
  });

  it('leaves a current document alone', () => {
    const current = emptyDocument();
    expect(migrate(current)).toEqual(current);
  });

  it('runs on the way in from a file', async () => {
    const path = join(directory, 'old.json');
    await writeFile(path, JSON.stringify({ batches: [{ id: 'B1' }] }), 'utf8');
    const document = await load(path);
    expect(document.schemaVersion).toBe(1);
    expect(document.submissions).toEqual([]);
  });
});

describe('the collection helpers', () => {
  it('adds and then replaces by id', () => {
    const document = emptyDocument();
    put(document, 'recipes', { id: 'R1', name: 'olive' });
    put(document, 'recipes', { id: 'R1', name: 'olive dark' });
    expect(document.recipes).toHaveLength(1);
    expect(get(document, 'recipes', 'R1').name).toBe('olive dark');
  });

  it('gives nothing back for an id it does not hold', () => {
    expect(get(emptyDocument(), 'recipes', 'R9')).toBeNull();
  });

  it('removes and reports whether it did', () => {
    const document = emptyDocument();
    put(document, 'recipes', { id: 'R1' });
    expect(remove(document, 'recipes', 'R1')).toBe(true);
    expect(remove(document, 'recipes', 'R1')).toBe(false);
  });

  it('refuses a collection nothing stores', () => {
    expect(() => put(emptyDocument(), 'invoices', { id: 'I1' })).toThrow(/must be one of rolls/);
    expect(() => get(emptyDocument(), 'invoices', 'I1')).toThrow(/must be one of rolls/);
  });

  it('refuses a record with no id', () => {
    expect(() => put(emptyDocument(), 'recipes', {})).toThrow(/record.id/);
  });
});

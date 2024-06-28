/**
 * The file store.
 *
 * One JSON document per works, read whole and written whole. That is not
 * elegant and it does not need to be: the largest works this runs for holds a
 * few thousand batches a year, and a format anybody can open in an editor when
 * something goes wrong is worth more here than a database.
 *
 * Writes go to a temporary file and are renamed into place, because the one
 * failure that cannot be tolerated is a half written document. A rename on the
 * same filesystem is atomic and that is the whole trick.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FieldError, requireInteger, requireText } from '../valid/guards.js';

export const SCHEMA_VERSION = 1;

export const COLLECTIONS = ['rolls', 'lots', 'recipes', 'batches', 'submissions', 'stockLots'];

export function emptyDocument() {
  const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, []]));
  return { schemaVersion: SCHEMA_VERSION, writtenAt: null, ...collections };
}

export function validateDocument(document) {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new FieldError('document', 'must be an object', document);
  }
  const version = requireInteger(document.schemaVersion, 'document.schemaVersion');
  if (version > SCHEMA_VERSION) {
    throw new FieldError(
      'document.schemaVersion',
      `is ${version}, which this build does not understand`,
      version
    );
  }
  for (const name of COLLECTIONS) {
    if (!Array.isArray(document[name])) {
      throw new FieldError(`document.${name}`, 'must be an array', document[name]);
    }
  }
  return document;
}

export async function load(path) {
  requireText(path, 'path', { maxLength: 4096 });
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return emptyDocument();
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new FieldError('document', `is not valid json (${error.message})`, path);
  }
  return validateDocument(migrate(parsed));
}

export async function save(path, document, { now = () => new Date().toISOString() } = {}) {
  requireText(path, 'path', { maxLength: 4096 });
  validateDocument(document);
  const stamped = { ...document, writtenAt: now() };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(stamped, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return stamped;
}

/**
 * Bring an older document forward. Every step is written as its own function so
 * a migration can be read and tested on its own.
 */
export function migrate(document) {
  let current = document;
  if (typeof current?.schemaVersion !== 'number') {
    current = { ...current, schemaVersion: 0 };
  }
  if (current.schemaVersion === 0) {
    current = fromVersionZero(current);
  }
  return current;
}

function fromVersionZero(document) {
  const collections = Object.fromEntries(
    COLLECTIONS.map((name) => [name, Array.isArray(document[name]) ? document[name] : []])
  );
  return { ...document, ...collections, schemaVersion: 1 };
}

export function put(document, collection, record) {
  if (!COLLECTIONS.includes(collection)) {
    throw new FieldError('collection', `must be one of ${COLLECTIONS.join(', ')}`, collection);
  }
  const id = requireText(record.id, 'record.id', { maxLength: 64 });
  const rows = document[collection];
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) {
    rows.push(record);
  } else {
    rows[index] = record;
  }
  return record;
}

export function get(document, collection, id) {
  if (!COLLECTIONS.includes(collection)) {
    throw new FieldError('collection', `must be one of ${COLLECTIONS.join(', ')}`, collection);
  }
  return document[collection].find((row) => row.id === id) ?? null;
}

export function remove(document, collection, id) {
  const rows = document[collection];
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return false;
  rows.splice(index, 1);
  return true;
}

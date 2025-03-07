/**
 * The repository.
 *
 * The json store knows about collections and identifiers. This knows about the
 * things the works actually holds, and it is the only place that turns a frozen
 * domain object into something that survives a round trip through a file.
 *
 * Domain objects are frozen and carry derived fields. Those are dropped on the
 * way out rather than stored, because a derived field that persists is a field
 * that goes stale the first time the rule behind it changes.
 */

import { FieldError, requireText } from '../valid/guards.js';
import { COLLECTIONS, get, load, put, remove, save } from './json.js';
import { pruneBackups, takeBackup } from './backup.js';

/** The fields each kind of record keeps. Everything else is derived and dropped. */
export const SHAPES = Object.freeze({
  rolls: [
    'id',
    'quality',
    'construction',
    'blend',
    'length',
    'lengthUnit',
    'widthCm',
    'gsm',
    'weighedMass',
    'faults',
  ],
  lots: ['id', 'customer', 'rollIds', 'quality'],
  recipes: ['id', 'name', 'process', 'substrate', 'liquorRatio', 'dyes', 'auxiliaries'],
  batches: ['id', 'machineId', 'recipeId', 'lotIds', 'fibreKg', 'plannedRatio', 'actualRatio'],
  submissions: ['id', 'customer', 'standardName', 'standard', 'substrate', 'dips', 'outcome'],
  stockLots: ['id', 'code', 'quantityKg', 'remainingKg', 'pricePerKg', 'receivedAt', 'strength'],
});

export function shapeOf(collection) {
  const shape = SHAPES[collection];
  if (!shape) {
    throw new FieldError(
      'collection',
      `must be one of ${Object.keys(SHAPES).join(', ')}`,
      collection
    );
  }
  return shape;
}

/** Take only the fields the shape names, in the order it names them. */
export function toRecord(collection, value) {
  const shape = shapeOf(collection);
  const record = {};
  for (const field of shape) {
    if (value[field] !== undefined) {
      record[field] = value[field];
    }
  }
  requireText(record.id, `${collection}.id`, { maxLength: 64 });
  return record;
}

export async function open(path, { backups = true, keep = 14 } = {}) {
  const document = await load(path);
  return { path, document, dirty: false, backups, keep, lastBackup: null };
}

export function store(repository, collection, value) {
  const record = toRecord(collection, value);
  put(repository.document, collection, record);
  repository.dirty = true;
  return record;
}

export function fetch(repository, collection, id) {
  shapeOf(collection);
  return get(repository.document, collection, id);
}

export function list(repository, collection, predicate = () => true) {
  shapeOf(collection);
  return repository.document[collection].filter(predicate);
}

export function drop(repository, collection, id) {
  shapeOf(collection);
  const removed = remove(repository.document, collection, id);
  repository.dirty = repository.dirty || removed;
  return removed;
}

/**
 * Write the document out, taking a copy of what was there first. The copy is
 * taken before the write and not after, which is the only ordering that helps:
 * a backup of the file you just wrote is a backup of the problem.
 */
export async function commit(repository, options = {}) {
  if (!repository.dirty) return { written: false, backedUp: null, document: repository.document };
  let backedUp = null;
  if (repository.backups) {
    backedUp = await takeBackup(repository.path, options);
  }
  const written = await save(repository.path, repository.document, options);
  repository.document = written;
  repository.dirty = false;
  repository.lastBackup = backedUp;
  if (repository.backups && backedUp !== null) {
    await pruneBackups(repository.path, { keep: repository.keep, ...options });
  }
  return { written: true, backedUp, document: written };
}

/** Every collection with a count, which is what a status command prints. */
export function census(repository) {
  return COLLECTIONS.map((collection) => ({
    collection,
    count: repository.document[collection].length,
  }));
}

/** Records that name something no longer in the file, which should be nothing. */
export function danglingReferences(repository) {
  const rollIds = new Set(repository.document.rolls.map((row) => row.id));
  const recipeIds = new Set(repository.document.recipes.map((row) => row.id));
  const dangling = [];
  for (const lot of repository.document.lots) {
    for (const rollId of lot.rollIds ?? []) {
      if (!rollIds.has(rollId)) {
        dangling.push({ collection: 'lots', id: lot.id, missing: rollId, kind: 'roll' });
      }
    }
  }
  for (const batch of repository.document.batches) {
    if (batch.recipeId && !recipeIds.has(batch.recipeId)) {
      dangling.push({
        collection: 'batches',
        id: batch.id,
        missing: batch.recipeId,
        kind: 'recipe',
      });
    }
  }
  return dangling;
}

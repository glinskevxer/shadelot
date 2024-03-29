/**
 * Identifiers.
 *
 * Everything on this floor is traced by a printed label that somebody reads
 * aloud across a noisy machine hall, so the formats are short, they carry the
 * year, and they never use a character that is ambiguous when handwritten. No
 * letter I, no letter O, no digit 0 and no digit 1 in the random part.
 */

import { FieldError, requireInteger, requireText } from '../valid/guards.js';

const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const PREFIXES = Object.freeze({
  greigeLot: 'G',
  batch: 'B',
  labDip: 'L',
  recipe: 'R',
  shipment: 'S',
  effluentRun: 'E',
});

export function kinds() {
  return Object.keys(PREFIXES);
}

export function prefixFor(kind) {
  const prefix = PREFIXES[kind];
  if (prefix === undefined) {
    throw new FieldError('kind', `must be one of ${kinds().join(', ')}`, kind);
  }
  return prefix;
}

/**
 * A sequential identifier, which is what the floor prefers because it sorts and
 * a missing one is visible. Year is the two digit works year.
 */
export function sequentialId(kind, year, sequence) {
  const prefix = prefixFor(kind);
  requireInteger(year, 'year');
  requireInteger(sequence, 'sequence');
  if (year < 2000 || year > 2999) {
    throw new FieldError('year', 'must be a four digit calendar year', year);
  }
  if (sequence < 1 || sequence > 99999) {
    throw new FieldError('sequence', 'must lie between 1 and 99999', sequence);
  }
  return `${prefix}${String(year % 100).padStart(2, '0')}-${String(sequence).padStart(5, '0')}`;
}

/** A random suffix for anything that has no counter to draw from. */
export function randomSuffix(length = 4, random = Math.random) {
  requireInteger(length, 'length');
  if (length < 2 || length > 12) {
    throw new FieldError('length', 'must lie between 2 and 12', length);
  }
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SAFE_ALPHABET[Math.floor(random() * SAFE_ALPHABET.length)];
  }
  return out;
}

export function parseId(id) {
  const text = requireText(id, 'id', { maxLength: 16 });
  const match = /^([A-Z])(\d{2})-(\d{5})$/.exec(text);
  if (!match) {
    throw new FieldError('id', 'must look like B25-00147', id);
  }
  const [, prefix, year, sequence] = match;
  const kind = kinds().find((name) => PREFIXES[name] === prefix);
  if (!kind) {
    throw new FieldError('id', `carries an unknown prefix ${prefix}`, id);
  }
  return { kind, year: 2000 + Number(year), sequence: Number(sequence), id: text };
}

/** True when the identifier is well formed and of the kind the caller expected. */
export function isId(id, kind) {
  try {
    const parsed = parseId(id);
    return kind === undefined || parsed.kind === kind;
  } catch {
    return false;
  }
}

export const alphabet = SAFE_ALPHABET;

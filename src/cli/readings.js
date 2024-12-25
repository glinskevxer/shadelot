/**
 * Reading a colour reading off a file.
 *
 * Three commands were each carrying their own copy of this and they had already
 * drifted: one accepted a reading with no b channel, one accepted a string in
 * L, and the third was the only one that said which file was wrong. This is the
 * strict version of the three, and every command uses it.
 */

import { makeLab } from '../colour/lab.js';
import { makeReadingSet } from '../colour/illuminant.js';
import { dataError } from './exit.js';

const CHANNELS = ['L', 'a', 'b'];

export function toReading(value, what) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw dataError(`the ${what} must be an object carrying L, a and b`);
  }
  const missing = CHANNELS.filter(
    (channel) => typeof value[channel] !== 'number' || !Number.isFinite(value[channel])
  );
  if (missing.length > 0) {
    throw dataError(`the ${what} is missing a usable ${missing.join(' and ')}`);
  }
  return makeLab(value.L, value.a, value.b);
}

/** A set of readings under every illuminant, for the metamerism commands. */
export function toReadingSet(value, what) {
  if (typeof value !== 'object' || value === null) {
    throw dataError(`the ${what} must carry one reading per illuminant`);
  }
  try {
    return makeReadingSet(
      Object.fromEntries(
        Object.entries(value).map(([name, reading]) => [
          name,
          toReading(reading, `${what} ${name}`),
        ])
      )
    );
  } catch (error) {
    if (error.exitCode) throw error;
    throw dataError(`the ${what} ${error.message}`);
  }
}

/** Whether a document looks like a set rather than a single reading. */
export function looksLikeSet(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.L !== 'number' &&
    Object.values(value).some((entry) => entry && typeof entry.L === 'number')
  );
}

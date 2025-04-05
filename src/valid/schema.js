/**
 * File shapes.
 *
 * Every command was checking its own input file by hand, and each one checked a
 * slightly different set of fields with a slightly different message. This is
 * the same check written once as data: a list of fields, what each has to be,
 * and whether it is required.
 *
 * It is deliberately not a general validator. It handles the six shapes this
 * program reads and nothing else, because a general one would need a schema
 * language and this needs eleven lines of table.
 */

import { FieldError } from './guards.js';

export const TYPES = ['string', 'number', 'positive', 'boolean', 'array', 'object', 'reading'];

function isReading(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['L', 'a', 'b'].every(
      (channel) => typeof value[channel] === 'number' && Number.isFinite(value[channel])
    )
  );
}

const CHECKS = {
  string: (value) => typeof value === 'string' && value.trim() !== '',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  positive: (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  boolean: (value) => typeof value === 'boolean',
  array: (value) => Array.isArray(value),
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  reading: isReading,
};

export function describeType(type) {
  const words = {
    string: 'a non empty string',
    number: 'a finite number',
    positive: 'a number greater than zero',
    boolean: 'true or false',
    array: 'an array',
    object: 'an object',
    reading: 'a reading carrying L, a and b',
  };
  const description = words[type];
  if (!description) {
    throw new FieldError('type', `must be one of ${TYPES.join(', ')}`, type);
  }
  return description;
}

/**
 * Check a document against a field list. Every problem is collected rather than
 * the first one thrown, because a caller fixing a file wants the whole list.
 */
export function checkShape(document, fields, { what = 'file' } = {}) {
  const problems = [];
  if (!CHECKS.object(document)) {
    return [`the ${what} must be an object`];
  }
  for (const field of fields) {
    const value = document[field.name];
    if (value === undefined || value === null) {
      if (field.required !== false) {
        problems.push(`the ${what} has no ${field.name}`);
      }
      continue;
    }
    if (!CHECKS[field.type]) {
      throw new FieldError('field.type', `must be one of ${TYPES.join(', ')}`, field.type);
    }
    if (!CHECKS[field.type](value)) {
      problems.push(`${field.name} in the ${what} must be ${describeType(field.type)}`);
    }
  }
  return problems;
}

/** The shapes this program reads, one entry per file a command is pointed at. */
export const SHAPES = Object.freeze({
  recipe: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'process', type: 'string' },
    { name: 'substrate', type: 'string' },
    { name: 'liquorRatio', type: 'positive' },
    { name: 'dyes', type: 'array' },
    { name: 'auxiliaries', type: 'array', required: false },
  ],
  profile: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'segments', type: 'array' },
    { name: 'startAt', type: 'number', required: false },
  ],
  roll: [
    { name: 'id', type: 'string' },
    { name: 'lengthMetres', type: 'positive' },
    { name: 'widthCm', type: 'positive' },
    { name: 'faults', type: 'array', required: false },
  ],
  order: [
    { name: 'id', type: 'string' },
    { name: 'customer', type: 'string' },
    { name: 'metres', type: 'positive' },
    { name: 'dueAt', type: 'string' },
    { name: 'standard', type: 'reading' },
    { name: 'deliveries', type: 'array', required: false },
  ],
  dipSeries: [
    { name: 'standard', type: 'reading' },
    { name: 'dips', type: 'array' },
    { name: 'customer', type: 'string', required: false },
    { name: 'standardName', type: 'string', required: false },
  ],
  works: [
    { name: 'dyestuffs', type: 'array' },
    { name: 'chemicals', type: 'array' },
    { name: 'machines', type: 'array' },
    { name: 'tolerances', type: 'array', required: false },
  ],
});

export function shapeNames() {
  return Object.keys(SHAPES);
}

export function fieldsFor(name) {
  const fields = SHAPES[name];
  if (!fields) {
    throw new FieldError('shape', `must be one of ${shapeNames().join(', ')}`, name);
  }
  return fields;
}

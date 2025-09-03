/**
 * Reading the files a command is pointed at.
 *
 * Every command takes its input as a json file rather than as a pile of flags,
 * because a recipe has thirty numbers in it and nobody types thirty flags twice.
 * The loader is here so every command fails the same way on a missing file, a
 * malformed one, or one that holds the wrong shape.
 */

import { readFile } from 'node:fs/promises';
import { checkShape, fieldsFor } from '../valid/schema.js';
import { dataError, notFoundError } from './exit.js';

export async function readJson(path, { what = 'file' } = {}) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw notFoundError(`the ${what} ${path} is not there`);
    }
    if (error.code === 'EISDIR') {
      throw dataError(`${path} is a directory, not a ${what}`);
    }
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw dataError(`the ${what} ${path} is not valid json: ${error.message}`);
  }
}

export async function readArray(path, { what = 'file' } = {}) {
  const parsed = await readJson(path, { what });
  if (!Array.isArray(parsed)) {
    throw dataError(`the ${what} ${path} must hold an array`);
  }
  return parsed;
}

export async function readObject(path, { what = 'file' } = {}) {
  const parsed = await readJson(path, { what });
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw dataError(`the ${what} ${path} must hold an object`);
  }
  return parsed;
}

/** A collector for repeated flags, which commander hands one value at a time. */
export function collect(value, previous = []) {
  return [...previous, value];
}

/** Parse a flag that must be a number, and say which flag it was. */
export function numberFlag(flag) {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw dataError(`${flag} must be a number, received ${value}`);
    }
    return parsed;
  };
}

export function positiveFlag(flag) {
  const parse = numberFlag(flag);
  return (value) => {
    const parsed = parse(value);
    if (parsed <= 0) {
      throw dataError(`${flag} must be greater than zero, received ${value}`);
    }
    return parsed;
  };
}

/** Somewhere to send output that a test can capture without touching stdout. */
export function createOutput() {
  const lines = [];
  return {
    lines,
    write(text) {
      lines.push(String(text));
    },
    text() {
      return lines.join('\n');
    },
  };
}

export const stdout = {
  write(text) {
    process.stdout.write(`${text}\n`);
  },
};

export const stderr = {
  write(text) {
    process.stderr.write(`${text}\n`);
  },
};

/**
 * Read a file and check it against one of the shapes before the caller touches
 * it. Every problem is reported in one message, because a caller fixing a file
 * by hand wants the list rather than one line at a time.
 */
export async function readShaped(path, shape, { what } = {}) {
  const label = what ?? `${shape} file`;
  const document = await readObject(path, { what: label });
  const problems = checkShape(document, fieldsFor(shape), { what: label });
  if (problems.length > 0) {
    throw dataError(`${path} is not usable: ${problems.join('; ')}`);
  }
  return document;
}

/**
 * Read a list of rows and build each one, saying which row failed.
 *
 * Six commands were each doing this and each phrasing the message differently:
 * one said "row 3", one said "entry 3" and one gave the index of the row after
 * the bad one. The index is the one the caller counts from a text editor, which
 * is nought, and the word is "row" everywhere.
 */
export async function readRows(path, build, { what = 'file', min = 1 } = {}) {
  const rows = await readArray(path, { what });
  if (rows.length < min) {
    throw dataError(`the ${what} ${path} holds ${rows.length} rows, it needs at least ${min}`);
  }
  return rows.map((row, index) => {
    try {
      return build(row, index);
    } catch (error) {
      if (error.exitCode) throw error;
      throw dataError(`row ${index} in the ${what} is not usable, ${error.message}`);
    }
  });
}

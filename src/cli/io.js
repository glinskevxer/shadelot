/**
 * Reading the files a command is pointed at.
 *
 * Every command takes its input as a json file rather than as a pile of flags,
 * because a recipe has thirty numbers in it and nobody types thirty flags twice.
 * The loader is here so every command fails the same way on a missing file, a
 * malformed one, or one that holds the wrong shape.
 */

import { readFile } from 'node:fs/promises';
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

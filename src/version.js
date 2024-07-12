/**
 * The version, read from the package rather than written twice.
 *
 * A version that lives in two files is a version that disagrees with itself
 * eventually, and the one printed by the program is the one that matters.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function packagePath() {
  return join(here, '..', 'package.json');
}

export function readVersion({ path = packagePath() } = {}) {
  const text = readFileSync(path, 'utf8');
  const parsed = JSON.parse(text);
  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    throw new Error(`no version in ${path}`);
  }
  return parsed.version;
}

export function readName({ path = packagePath() } = {}) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.name;
}

export const version = readVersion();
export const name = readName();

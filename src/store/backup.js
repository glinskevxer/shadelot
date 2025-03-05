/**
 * Backups.
 *
 * The whole works is one json file, which is the best thing about the storage
 * and the worst. A copy is taken before every write that changes anything, and
 * they are kept by date with the oldest thrown away, because a works that keeps
 * every copy forever runs out of disk on a Sunday and nobody notices until
 * Monday.
 *
 * Restoring is deliberately not automatic. A file that restores itself hides
 * whatever broke it.
 */

import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { FieldError, requireInteger, requirePositive, requireText } from '../valid/guards.js';
import { load, validateDocument } from './json.js';

const STAMP = /^(.+)\.(\d{8}T\d{6})\.bak$/;

export function stampFor(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

export function backupName(path, date) {
  return `${basename(requireText(path, 'path', { maxLength: 4096 }))}.${stampFor(date)}.bak`;
}

export function parseBackupName(name) {
  const match = STAMP.exec(name);
  if (!match) return null;
  const [, base, stamp] = match;
  return { base, stamp, name };
}

export async function backupDirectory(path, { directory } = {}) {
  const target = directory ?? join(dirname(path), 'backups');
  await mkdir(target, { recursive: true });
  return target;
}

/** Take a copy. Returns null when there is nothing there yet to copy. */
export async function takeBackup(path, { now = () => new Date(), directory } = {}) {
  try {
    await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const target = await backupDirectory(path, { directory });
  const name = backupName(path, now());
  const destination = join(target, name);
  await copyFile(path, destination);
  return destination;
}

export async function listBackups(path, { directory } = {}) {
  const target = await backupDirectory(path, { directory });
  const base = basename(path);
  const entries = await readdir(target);
  return entries
    .map(parseBackupName)
    .filter((entry) => entry !== null && entry.base === base)
    .sort((a, b) => b.stamp.localeCompare(a.stamp))
    .map((entry) => ({ ...entry, path: join(target, entry.name) }));
}

/** Throw away everything past the count to keep, oldest first. */
export async function pruneBackups(path, { keep = 14, directory } = {}) {
  requireInteger(keep, 'keep');
  requirePositive(keep, 'keep');
  const all = await listBackups(path, { directory });
  const doomed = all.slice(keep);
  for (const entry of doomed) {
    await unlink(entry.path);
  }
  return { kept: all.length - doomed.length, removed: doomed.map((entry) => entry.name) };
}

/**
 * Read a backup and check it is a document before handing it back. The caller
 * puts it in place; nothing here writes over a live file.
 */
export async function readBackup(backupPath) {
  const document = await load(requireText(backupPath, 'backupPath', { maxLength: 4096 }));
  return validateDocument(document);
}

/** The newest backup, which is what a restore usually wants. */
export async function newestBackup(path, options) {
  const all = await listBackups(path, options);
  if (all.length === 0) {
    throw new FieldError('path', 'has no backups to read', path);
  }
  return all[0];
}

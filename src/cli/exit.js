/**
 * Exit codes.
 *
 * These are an interface. A works runs this out of cron and branches on the
 * code, so the number a case exits with is fixed once it has shipped and the
 * message text is not. Nothing new gets code 1: that stays the catch all for a
 * fault nobody anticipated.
 */

import { FieldError } from '../valid/guards.js';

export const EXIT = Object.freeze({
  ok: 0,
  fault: 1,
  usage: 2,
  notFound: 3,
  invalidData: 4,
  outOfTolerance: 5,
  consentBreached: 6,
  outOfStock: 7,
});

export function codeNames() {
  return Object.keys(EXIT);
}

export function codeFor(name) {
  const code = EXIT[name];
  if (code === undefined) {
    throw new FieldError('name', `must be one of ${codeNames().join(', ')}`, name);
  }
  return code;
}

export function nameFor(code) {
  const entry = Object.entries(EXIT).find(([, value]) => value === code);
  if (!entry) {
    throw new FieldError('code', 'is not an exit code this program uses', code);
  }
  return entry[0];
}

/** An error carrying the code the process should leave with. */
export class CommandError extends Error {
  constructor(message, name = 'fault') {
    super(message);
    this.name = 'CommandError';
    this.exitCode = codeFor(name);
    this.exitName = name;
  }
}

export function usageError(message) {
  return new CommandError(message, 'usage');
}

export function notFoundError(message) {
  return new CommandError(message, 'notFound');
}

export function dataError(message) {
  return new CommandError(message, 'invalidData');
}

/** Turn any thrown thing into a code and a line to print. */
export function classify(error) {
  if (error instanceof CommandError) {
    return { code: error.exitCode, name: error.exitName, message: error.message };
  }
  if (error instanceof FieldError) {
    return { code: EXIT.invalidData, name: 'invalidData', message: error.message };
  }
  if (error && error.code === 'ENOENT') {
    return { code: EXIT.notFound, name: 'notFound', message: `${error.path} is not there` };
  }
  return { code: EXIT.fault, name: 'fault', message: error?.message ?? String(error) };
}

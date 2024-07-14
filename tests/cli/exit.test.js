import { describe, expect, it } from 'vitest';
import { FieldError } from '../../src/valid/guards.js';
import {
  CommandError,
  EXIT,
  classify,
  codeFor,
  codeNames,
  dataError,
  nameFor,
  notFoundError,
  usageError,
} from '../../src/cli/exit.js';

describe('the codes themselves', () => {
  it('pin success to zero and the catch all to one', () => {
    expect(EXIT.ok).toBe(0);
    expect(EXIT.fault).toBe(1);
  });

  it('give every case its own number', () => {
    const codes = Object.values(EXIT);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('stay inside what a shell can report', () => {
    for (const code of Object.values(EXIT)) {
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThan(126);
    }
  });

  it('go both ways', () => {
    for (const name of codeNames()) {
      expect(nameFor(codeFor(name))).toBe(name);
    }
  });

  it('refuse a name or a code nothing uses', () => {
    expect(() => codeFor('confused')).toThrow(/must be one of ok, fault/);
    expect(() => nameFor(99)).toThrow(/not an exit code/);
  });
});

describe('command errors', () => {
  it('carry the code they should leave with', () => {
    expect(new CommandError('nope', 'outOfStock').exitCode).toBe(EXIT.outOfStock);
    expect(usageError('bad flag').exitCode).toBe(EXIT.usage);
    expect(notFoundError('no batch').exitCode).toBe(EXIT.notFound);
    expect(dataError('bad row').exitCode).toBe(EXIT.invalidData);
  });

  it('default to the catch all', () => {
    expect(new CommandError('something').exitCode).toBe(EXIT.fault);
  });

  it('refuse a code name that does not exist rather than defaulting quietly', () => {
    expect(() => new CommandError('x', 'mystery')).toThrow(/must be one of/);
  });
});

describe('classifying whatever was thrown', () => {
  it('passes a command error straight through', () => {
    expect(classify(usageError('bad flag'))).toEqual({
      code: 2,
      name: 'usage',
      message: 'bad flag',
    });
  });

  it('reads a field error as bad data', () => {
    const result = classify(new FieldError('gsm', 'must be positive', 0));
    expect(result.code).toBe(EXIT.invalidData);
    expect(result.message).toMatch(/^gsm must be positive/);
  });

  it('reads a missing file as not found and names the path', () => {
    const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT', path: '/works/data.json' });
    expect(classify(error)).toEqual({
      code: 3,
      name: 'notFound',
      message: '/works/data.json is not there',
    });
  });

  it('falls back to the catch all for anything else', () => {
    expect(classify(new TypeError('undefined is not a function')).code).toBe(1);
    expect(classify('a string somebody threw').code).toBe(1);
    expect(classify(null).message).toBe('null');
  });
});

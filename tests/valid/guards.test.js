import { describe, expect, it } from 'vitest';
import {
  FieldError,
  optional,
  requireArray,
  requireInRange,
  requireInteger,
  requireNonNegative,
  requireNumber,
  requireOneOf,
  requirePositive,
  requireText,
} from '../../src/valid/guards.js';

describe('the number guards', () => {
  it('pass a good value straight back', () => {
    expect(requireNumber(12.5, 'gsm')).toBe(12.5);
    expect(requirePositive(0.001, 'owf')).toBe(0.001);
    expect(requireNonNegative(0, 'salt')).toBe(0);
  });

  it('name the field in the message', () => {
    expect(() => requirePositive(0, 'liquorRatio')).toThrow(/^liquorRatio must be greater/);
    expect(() => requireNonNegative(-1, 'dose')).toThrow(/^dose must not be negative/);
  });

  it('reject the shapes a spreadsheet produces', () => {
    expect(() => requireNumber('12', 'gsm')).toThrow(/received "12"/);
    expect(() => requireNumber(null, 'gsm')).toThrow(/received null/);
    expect(() => requireNumber(Number.NaN, 'gsm')).toThrow(FieldError);
  });

  it('carries the field and the value on the error itself', () => {
    try {
      requirePositive(-4, 'width');
      throw new Error('should not reach here');
    } catch (error) {
      expect(error).toBeInstanceOf(FieldError);
      expect(error.field).toBe('width');
      expect(error.value).toBe(-4);
    }
  });
});

describe('range and integer', () => {
  it('accept the endpoints', () => {
    expect(requireInRange(0, 'ph', 0, 14)).toBe(0);
    expect(requireInRange(14, 'ph', 0, 14)).toBe(14);
  });

  it('reject outside and say the bounds', () => {
    expect(() => requireInRange(14.1, 'ph', 0, 14)).toThrow(/between 0 and 14/);
  });

  it('will not take a fractional roll count', () => {
    expect(() => requireInteger(3.5, 'rolls')).toThrow(/whole number/);
    expect(requireInteger(3, 'rolls')).toBe(3);
  });
});

describe('text and enumerations', () => {
  it('trims and returns', () => {
    expect(requireText('  jet 4 ', 'machine')).toBe('jet 4');
  });

  it('refuses whitespace only', () => {
    expect(() => requireText('   ', 'machine')).toThrow(/non empty string/);
  });

  it('refuses an over long note and reports the length it saw', () => {
    expect(() => requireText('x'.repeat(200), 'note', { maxLength: 40 })).toThrow(/received 200/);
  });

  it('lists the allowed values when one is missed', () => {
    expect(() => requireOneOf('vat', 'class', ['reactive', 'disperse'])).toThrow(
      /must be one of reactive, disperse/
    );
  });
});

describe('arrays and optionals', () => {
  it('enforces a minimum length', () => {
    expect(() => requireArray([], 'rolls', { min: 1 })).toThrow(/at least 1 entries/);
    expect(requireArray([1, 2], 'rolls', { min: 1 })).toHaveLength(2);
  });

  it('refuses something that only looks like an array', () => {
    expect(() => requireArray({ length: 2 }, 'rolls')).toThrow(/must be an array/);
  });

  it('lets an absent value fall through to a default', () => {
    expect(optional(undefined, requirePositive, 8)).toBe(8);
    expect(optional(null, requirePositive, 8)).toBe(8);
    expect(optional(3, (v) => requirePositive(v, 'x'), 8)).toBe(3);
  });
});

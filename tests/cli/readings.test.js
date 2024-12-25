import { describe, expect, it } from 'vitest';
import { EXIT } from '../../src/cli/exit.js';
import { looksLikeSet, toReading, toReadingSet } from '../../src/cli/readings.js';

describe('one reading', () => {
  it('takes a complete one', () => {
    expect(toReading({ L: 52.1, a: -14.3, b: 22.7 }, 'standard')).toEqual({
      L: 52.1,
      a: -14.3,
      b: 22.7,
    });
  });

  it('ignores the extra fields an instrument writes', () => {
    const reading = toReading({ L: 52.1, a: -14.3, b: 22.7, name: 'olive', at: '2025-04-02' }, 'x');
    expect(Object.keys(reading)).toEqual(['L', 'a', 'b']);
  });

  it('names every channel that is missing, not the first', () => {
    expect(() => toReading({ L: 52.1 }, 'standard')).toThrow(/missing a usable a and b/);
  });

  it('refuses a channel that is a string, which is what a spreadsheet exports', () => {
    expect(() => toReading({ L: '52.1', a: -14.3, b: 22.7 }, 'batch')).toThrow(
      /missing a usable L/
    );
  });

  it('refuses an infinite channel', () => {
    expect(() => toReading({ L: Infinity, a: 0, b: 0 }, 'batch')).toThrow(/missing a usable L/);
  });

  it('refuses an array or a null', () => {
    expect(() => toReading([52.1, -14.3, 22.7], 'batch')).toThrow(/must be an object/);
    expect(() => toReading(null, 'batch')).toThrow(/must be an object/);
  });

  it('leaves with the invalid data code', () => {
    try {
      toReading({}, 'batch');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.exitCode).toBe(EXIT.invalidData);
    }
  });

  it('names the file in the message', () => {
    expect(() => toReading({}, 'the standard for O25-0900')).toThrow(/the standard for O25-0900/);
  });
});

describe('a set of readings', () => {
  const set = {
    D65: { L: 52.1, a: -14.3, b: 22.7 },
    TL84: { L: 51.9, a: -13.4, b: 21.9 },
    A: { L: 53, a: -11.6, b: 24.4 },
  };

  it('takes one reading under each illuminant', () => {
    expect(Object.keys(toReadingSet(set, 'sample'))).toEqual(['D65', 'TL84', 'A']);
  });

  it('says which illuminant is missing', () => {
    const partial = { D65: set.D65, TL84: set.TL84 };
    expect(() => toReadingSet(partial, 'sample')).toThrow(/missing a lab reading under A/);
  });

  it('says which illuminant carries the bad reading', () => {
    expect(() => toReadingSet({ ...set, TL84: { L: 51.9 } }, 'sample')).toThrow(
      /sample TL84 is missing a usable a and b/
    );
  });

  it('refuses something that is not an object at all', () => {
    expect(() => toReadingSet('D65', 'sample')).toThrow(/one reading per illuminant/);
  });
});

describe('telling the two apart', () => {
  it('reads a plain reading as a reading', () => {
    expect(looksLikeSet({ L: 52.1, a: -14.3, b: 22.7 })).toBe(false);
  });

  it('reads a set as a set', () => {
    expect(looksLikeSet({ D65: { L: 52.1, a: -14.3, b: 22.7 } })).toBe(true);
  });

  it('reads anything else as neither', () => {
    expect(looksLikeSet(null)).toBe(false);
    expect(looksLikeSet([])).toBe(false);
    expect(looksLikeSet({ name: 'olive' })).toBe(false);
  });
});

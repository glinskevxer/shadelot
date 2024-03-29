import { describe, expect, it } from 'vitest';
import {
  alphabet,
  isId,
  kinds,
  parseId,
  prefixFor,
  randomSuffix,
  sequentialId,
} from '../../src/model/ids.js';

describe('the kinds the floor labels', () => {
  it('lists them and gives each a single letter', () => {
    expect(kinds()).toContain('greigeLot');
    expect(kinds()).toContain('batch');
    expect(prefixFor('batch')).toBe('B');
    expect(prefixFor('labDip')).toBe('L');
  });

  it('refuses a kind nothing prints', () => {
    expect(() => prefixFor('pallet')).toThrow(/must be one of greigeLot, batch/);
  });
});

describe('sequential identifiers', () => {
  it('pads the sequence so a printed list sorts', () => {
    expect(sequentialId('batch', 2025, 147)).toBe('B25-00147');
    expect(sequentialId('greigeLot', 2024, 9)).toBe('G24-00009');
  });

  it('takes the works year as four digits and prints two', () => {
    expect(sequentialId('batch', 2008, 1)).toBe('B08-00001');
  });

  it('refuses a sequence that has run off the end of the label', () => {
    expect(() => sequentialId('batch', 2025, 100000)).toThrow(/between 1 and 99999/);
    expect(() => sequentialId('batch', 2025, 0)).toThrow(/between 1 and 99999/);
  });

  it('refuses a two digit year, which is the mistake people make', () => {
    expect(() => sequentialId('batch', 25, 1)).toThrow(/four digit calendar year/);
  });
});

describe('the random suffix', () => {
  it('never uses a character that is ambiguous handwritten', () => {
    expect(alphabet).not.toMatch(/[IO01]/);
  });

  it('is the length asked for', () => {
    expect(randomSuffix(6, () => 0.5)).toHaveLength(6);
  });

  it('is driven by the random source it is handed, so a test can pin it', () => {
    expect(randomSuffix(4, () => 0)).toBe('2222');
    expect(randomSuffix(3, () => 0.999999)).toBe('ZZZ');
  });

  it('refuses a length nothing would print', () => {
    expect(() => randomSuffix(1)).toThrow(/between 2 and 12/);
    expect(() => randomSuffix(20)).toThrow(/between 2 and 12/);
  });
});

describe('reading an identifier back', () => {
  it('gives back the kind, the year and the counter', () => {
    expect(parseId('B25-00147')).toEqual({
      kind: 'batch',
      year: 2025,
      sequence: 147,
      id: 'B25-00147',
    });
  });

  it('trims what somebody typed with a trailing space', () => {
    expect(parseId(' L24-00003 ').kind).toBe('labDip');
  });

  it('refuses a shape no label carries', () => {
    expect(() => parseId('B2500147')).toThrow(/must look like B25-00147/);
    expect(() => parseId('')).toThrow(/non empty string/);
  });

  it('refuses a letter nothing prints', () => {
    expect(() => parseId('Z25-00001')).toThrow(/unknown prefix Z/);
  });

  it('answers the yes or no question without throwing', () => {
    expect(isId('B25-00147')).toBe(true);
    expect(isId('B25-00147', 'batch')).toBe(true);
    expect(isId('B25-00147', 'labDip')).toBe(false);
    expect(isId('nonsense')).toBe(false);
    expect(isId(undefined)).toBe(false);
  });
});

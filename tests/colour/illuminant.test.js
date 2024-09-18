import { describe, expect, it } from 'vitest';
import { makeLab } from '../../src/colour/lab.js';
import { makeTolerance } from '../../src/colour/tolerance.js';
import {
  ILLUMINANTS,
  describeIlluminant,
  differencesByIlluminant,
  isMetameric,
  judgeAllIlluminants,
  makeReadingSet,
  metamerismIndex,
} from '../../src/colour/illuminant.js';

const standard = makeReadingSet({
  D65: makeLab(52.14, -14.32, 22.68),
  TL84: makeLab(51.88, -13.4, 21.9),
  A: makeLab(53.02, -11.6, 24.4),
});

const close = makeReadingSet({
  D65: makeLab(52.2, -14.3, 22.7),
  TL84: makeLab(51.94, -13.38, 21.92),
  A: makeLab(53.08, -11.58, 24.42),
});

const metameric = makeReadingSet({
  D65: makeLab(52.2, -14.3, 22.7),
  TL84: makeLab(53.6, -12.2, 20.4),
  A: makeLab(55.1, -9.4, 26.9),
});

describe('the illuminants', () => {
  it('names the three the lab reads under', () => {
    expect(ILLUMINANTS).toEqual(['D65', 'TL84', 'A']);
    expect(describeIlluminant('TL84')).toMatch(/shop fluorescent/);
  });

  it('refuses one the cabinet does not have', () => {
    expect(() => describeIlluminant('F11')).toThrow(/illuminant/);
  });
});

describe('a reading set', () => {
  it('needs one reading under each illuminant', () => {
    expect(Object.keys(standard)).toEqual(ILLUMINANTS);
  });

  it('refuses a set with one missing rather than filling it in', () => {
    expect(() => makeReadingSet({ D65: makeLab(50, 0, 0), TL84: makeLab(50, 0, 0) })).toThrow(
      /missing a lab reading under A/
    );
  });

  it('refuses a reading that is not one', () => {
    expect(() => makeReadingSet({ ...standard, A: { L: 'dark' } })).toThrow(
      /missing a lab reading/
    );
  });
});

describe('differences under each illuminant', () => {
  it('reads one number per illuminant', () => {
    const differences = differencesByIlluminant(standard, close);
    expect(Object.keys(differences)).toEqual(ILLUMINANTS);
    for (const value of Object.values(differences)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it('reads zero against itself', () => {
    const differences = differencesByIlluminant(standard, standard);
    expect(Object.values(differences).every((value) => value < 1e-9)).toBe(true);
  });

  it('takes the formula the customer quotes', () => {
    const cmc = differencesByIlluminant(standard, close, { formula: 'cmc' });
    const seventySix = differencesByIlluminant(standard, close, { formula: 'cie76' });
    expect(cmc.D65).not.toBeCloseTo(seventySix.D65, 6);
  });

  it('refuses a formula nothing implements', () => {
    expect(() => differencesByIlluminant(standard, close, { formula: 'cie2020' })).toThrow(
      /formula/
    );
  });
});

describe('the metamerism index', () => {
  it('is near nothing for a pair that tracks under all three', () => {
    const result = metamerismIndex(standard, close);
    expect(result.index).toBeLessThan(0.3);
    expect(isMetameric(result)).toBe(false);
  });

  it('is large for a pair that parts company', () => {
    const result = metamerismIndex(standard, metameric);
    expect(result.index).toBeGreaterThan(0.5);
    expect(isMetameric(result)).toBe(true);
  });

  it('names the illuminant the pair drifts worst under', () => {
    const result = metamerismIndex(standard, metameric);
    expect(ILLUMINANTS).toContain(result.worstUnder);
    expect(result.worstUnder).not.toBe(result.primary);
  });

  it('takes another illuminant as the one the pair was matched under', () => {
    const underShop = metamerismIndex(standard, metameric, { primary: 'TL84' });
    expect(underShop.primary).toBe('TL84');
    expect(underShop.worstUnder).not.toBe('TL84');
  });

  it('refuses a primary the lab does not read under', () => {
    expect(() => metamerismIndex(standard, close, { primary: 'F11' })).toThrow(/primary/);
  });

  it('refuses a limit of zero, which would call everything metameric', () => {
    expect(() => isMetameric(metamerismIndex(standard, close), { limit: 0 })).toThrow(/limit/);
  });
});

describe('judging under every illuminant', () => {
  const tolerance = makeTolerance({ name: 'x', formula: 'cmc', total: 1 });

  it('passes a pair that is inside under all three', () => {
    const result = judgeAllIlluminants(standard, close, tolerance);
    expect(result.verdict).toBe('pass');
    expect(result.failing).toEqual([]);
  });

  it('fails a pair that passes under daylight and fails under the shop light', () => {
    const result = judgeAllIlluminants(standard, metameric, tolerance);
    expect(result.passesUnderPrimary).toBe(true);
    expect(result.verdict).toBe('fail');
    expect(result.failing).toContain('TL84');
  });

  it('names every illuminant it failed under, not the first', () => {
    const result = judgeAllIlluminants(standard, metameric, tolerance);
    expect(result.failing.length).toBeGreaterThan(1);
  });
});

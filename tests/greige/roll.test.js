import { describe, expect, it } from 'vitest';
import {
  CONSTRUCTIONS,
  FIBRES,
  dyeableShare,
  isSuspect,
  makeRoll,
  massVariance,
  normaliseBlend,
} from '../../src/greige/roll.js';

const base = {
  id: 'R-1188',
  quality: 'combed poplin 40s',
  construction: 'woven',
  blend: { cotton: 97, elastane: 3 },
  length: 100,
  widthCm: 150,
  gsm: 200,
};

describe('blends', () => {
  it('takes a blend that totals a hundred', () => {
    expect(normaliseBlend({ cotton: 65, polyester: 35 })).toEqual({ cotton: 65, polyester: 35 });
  });

  it('refuses one that does not, because that is a typing error', () => {
    expect(() => normaliseBlend({ cotton: 65, polyester: 34 })).toThrow(/totals 99 percent/);
    expect(() => normaliseBlend({ cotton: 101 })).toThrow(/between 0.1 and 100/);
  });

  it('refuses a fibre nothing on this floor dyes', () => {
    expect(() => normaliseBlend({ hemp: 100 })).toThrow(/fibre must be one of/);
  });

  it('refuses an empty or non object blend', () => {
    expect(() => normaliseBlend({})).toThrow(/at least one fibre/);
    expect(() => normaliseBlend([])).toThrow(TypeError);
    expect(() => normaliseBlend(null)).toThrow(TypeError);
  });

  it('reports what share a dye class can reach', () => {
    expect(dyeableShare({ cotton: 65, polyester: 35 }, ['cotton', 'viscose'])).toBeCloseTo(0.65, 9);
    expect(dyeableShare({ cotton: 65, polyester: 35 }, ['polyester'])).toBeCloseTo(0.35, 9);
    expect(dyeableShare({ cotton: 100 }, ['polyester'])).toBe(0);
  });

  it('names every fibre and construction the floor handles', () => {
    expect(FIBRES).toContain('cotton');
    expect(FIBRES).toContain('elastane');
    expect(CONSTRUCTIONS).toEqual(['woven', 'weft-knit', 'warp-knit', 'yarn']);
  });
});

describe('making a roll', () => {
  it('works the nominal mass out of the docket', () => {
    const roll = makeRoll(base);
    expect(roll.nominalMass).toBeCloseTo(30, 9);
    expect(roll.mass).toBeCloseTo(30, 9);
    expect(roll.weighedMass).toBeNull();
  });

  it('prefers the weighed mass once goods inwards has one', () => {
    const roll = makeRoll({ ...base, weighedMass: 30.9 });
    expect(roll.mass).toBe(30.9);
    expect(roll.nominalMass).toBeCloseTo(30, 9);
  });

  it('is frozen, so nothing downstream edits a received roll', () => {
    const roll = makeRoll(base);
    expect(Object.isFrozen(roll)).toBe(true);
  });

  it('names the field when the docket is short of something', () => {
    expect(() => makeRoll({ ...base, gsm: 0 })).toThrow(/roll.gsm/);
    expect(() => makeRoll({ ...base, id: '' })).toThrow(/roll.id/);
    expect(() => makeRoll({ ...base, construction: 'nonwoven' })).toThrow(/roll.construction/);
  });

  it('defaults the fault count to none recorded', () => {
    expect(makeRoll(base).faults).toBe(0);
    expect(makeRoll({ ...base, faults: 4 }).faults).toBe(4);
  });
});

describe('the variance goods inwards watches', () => {
  it('is null while nothing has been weighed', () => {
    expect(massVariance(makeRoll(base))).toBeNull();
    expect(isSuspect(makeRoll(base))).toBe(false);
  });

  it('is signed so an over and an under read differently', () => {
    expect(massVariance(makeRoll({ ...base, weighedMass: 31.5 }))).toBeCloseTo(0.05, 9);
    expect(massVariance(makeRoll({ ...base, weighedMass: 28.5 }))).toBeCloseTo(-0.05, 9);
  });

  it('flags a roll past the limit in either direction', () => {
    expect(isSuspect(makeRoll({ ...base, weighedMass: 31.5 }))).toBe(true);
    expect(isSuspect(makeRoll({ ...base, weighedMass: 28.5 }))).toBe(true);
    expect(isSuspect(makeRoll({ ...base, weighedMass: 30.5 }))).toBe(false);
  });

  it('takes a wider limit for a quality known to weigh loose', () => {
    expect(isSuspect(makeRoll({ ...base, weighedMass: 31.5 }), { limit: 0.08 })).toBe(false);
  });
});

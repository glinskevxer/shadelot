import { describe, expect, it } from 'vitest';
import {
  RINSE_KINDS,
  batchWater,
  makeRinse,
  rinseVolume,
  specificWater,
  waterShares,
} from '../../src/utility/water.js';

describe('rinses', () => {
  it('takes a bath count for a drop and fill', () => {
    const rinse = makeRinse({ kind: 'drop-and-fill', baths: 3 });
    expect(rinse.baths).toBe(3);
    expect(rinse.temperature).toBe(40);
  });

  it('takes a rate and a time for an overflow', () => {
    const rinse = makeRinse({ kind: 'overflow', litresPerMinute: 80, minutes: 12 });
    expect(rinseVolume(rinse, 1600)).toBeCloseTo(960, 9);
  });

  it('does not read the bath volume for an overflow', () => {
    const rinse = makeRinse({ kind: 'overflow', litresPerMinute: 80, minutes: 12 });
    expect(rinseVolume(rinse, 1600)).toBe(rinseVolume(rinse, 4000));
  });

  it('reads the bath volume for a drop and fill', () => {
    const rinse = makeRinse({ kind: 'drop-and-fill', baths: 2 });
    expect(rinseVolume(rinse, 1600)).toBe(3200);
    expect(rinseVolume(rinse, 800)).toBe(1600);
  });

  it('refuses a kind nothing on the floor does', () => {
    expect(() => makeRinse({ kind: 'spray', baths: 2 })).toThrow(/rinse.kind/);
    expect(RINSE_KINDS).toEqual(['drop-and-fill', 'overflow']);
  });

  it('refuses a fractional bath count', () => {
    expect(() => makeRinse({ kind: 'drop-and-fill', baths: 2.5 })).toThrow(/whole number/);
  });

  it('refuses zero baths at the point it would be counted', () => {
    const rinse = makeRinse({ kind: 'drop-and-fill', baths: 0 });
    expect(() => rinseVolume(rinse, 1600)).toThrow(/at least one/);
  });
});

describe('water for a batch', () => {
  const rinses = [
    makeRinse({ kind: 'drop-and-fill', baths: 2 }),
    makeRinse({ kind: 'overflow', litresPerMinute: 80, minutes: 10 }),
  ];

  it('counts the dye bath, the rinses and the soaping', () => {
    const water = batchWater({ bathLitres: 1600, rinses, soapBaths: 1 });
    expect(water.dye).toBe(1600);
    expect(water.rinsed).toBe(3200 + 800);
    expect(water.soap).toBe(1600);
    expect(water.gross).toBe(7200);
  });

  it('counts a reused bath as a saving rather than leaving the fill out', () => {
    const water = batchWater({ bathLitres: 1600, rinses, soapBaths: 1, reusedBaths: 1 });
    expect(water.gross).toBe(7200);
    expect(water.saved).toBe(1600);
    expect(water.net).toBe(5600);
  });

  it('refuses to save more than the batch uses', () => {
    expect(() => batchWater({ bathLitres: 1600, reusedBaths: 4 })).toThrow(/saves more water/);
  });

  it('takes a batch with no rinses at all', () => {
    const water = batchWater({ bathLitres: 1600 });
    expect(water.rinsed).toBe(0);
    expect(water.net).toBe(1600);
  });

  it('refuses a bath volume of zero', () => {
    expect(() => batchWater({ bathLitres: 0 })).toThrow(/bathLitres/);
  });
});

describe('the benchmark numbers', () => {
  const water = batchWater({
    bathLitres: 1600,
    rinses: [makeRinse({ kind: 'drop-and-fill', baths: 3 })],
    soapBaths: 1,
  });

  it('divides the net by the cloth', () => {
    expect(specificWater(water, 200)).toBeCloseTo(40, 9);
  });

  it('refuses a load of zero', () => {
    expect(() => specificWater(water, 0)).toThrow(/fibreKg/);
  });

  it('splits the gross into shares that add to one', () => {
    const shares = waterShares(water);
    expect(shares.dye + shares.rinsed + shares.soap).toBeCloseTo(1, 9);
    expect(shares.rinsed).toBeGreaterThan(shares.dye);
  });
});

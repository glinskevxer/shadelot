import { describe, expect, it } from 'vitest';
import {
  VARIANCE_ORDER,
  describe as describeVariance,
  ranked,
  reconciles,
  splitVariance,
} from '../../src/analysis/variance.js';

const plan = [
  { band: 'pale', kg: 4000, perKg: 1.1 },
  { band: 'medium', kg: 5000, perKg: 1.4 },
  { band: 'dark', kg: 1000, perKg: 1.7 },
];

describe('the split', () => {
  it('is nothing when the month came in exactly on plan', () => {
    const variance = splitVariance(plan, plan);
    expect(variance.total).toBeCloseTo(0, 9);
    expect(variance.volume).toBeCloseTo(0, 9);
    expect(variance.mix).toBeCloseTo(0, 9);
    expect(variance.rate).toBeCloseTo(0, 9);
  });

  it('accounts for the whole difference every time', () => {
    const actual = [
      { band: 'pale', kg: 3000, perKg: 1.2 },
      { band: 'medium', kg: 6200, perKg: 1.38 },
      { band: 'dark', kg: 1400, perKg: 1.9 },
    ];
    const variance = splitVariance(plan, actual);
    expect(reconciles(variance)).toBe(true);
    expect(variance.unexplained).toBeCloseTo(0, 6);
  });

  it('puts a larger month down to volume alone when nothing else moved', () => {
    const actual = plan.map((row) => ({ ...row, kg: row.kg * 1.2 }));
    const variance = splitVariance(plan, actual);
    expect(variance.volume).toBeGreaterThan(0);
    expect(variance.mix).toBeCloseTo(0, 6);
    expect(variance.rate).toBeCloseTo(0, 6);
  });

  it('puts a darker month down to mix when the total and the rates held', () => {
    const actual = [
      { band: 'pale', kg: 3000, perKg: 1.1 },
      { band: 'medium', kg: 5000, perKg: 1.4 },
      { band: 'dark', kg: 2000, perKg: 1.7 },
    ];
    const variance = splitVariance(plan, actual);
    expect(variance.mix).toBeGreaterThan(0);
    expect(variance.rate).toBeCloseTo(0, 6);
  });

  it('puts dearer inputs down to rate when the volume and the mix held', () => {
    const actual = plan.map((row) => ({ ...row, perKg: row.perKg * 1.1 }));
    const variance = splitVariance(plan, actual);
    expect(variance.rate).toBeGreaterThan(0);
    expect(variance.volume).toBeCloseTo(0, 6);
    expect(variance.mix).toBeCloseTo(0, 6);
  });

  it('handles a band that only appears in the actual', () => {
    const actual = [...plan, { band: 'heavy', kg: 500, perKg: 2.1 }];
    const variance = splitVariance(plan, actual);
    expect(reconciles(variance)).toBe(true);
  });

  it('handles a band that was planned and never ran', () => {
    const variance = splitVariance(plan, plan.slice(0, 2));
    expect(reconciles(variance)).toBe(true);
  });

  it('refuses an empty plan or an empty actual', () => {
    expect(() => splitVariance([], plan)).toThrow(/at least 1 entries/);
    expect(() => splitVariance(plan, [])).toThrow(/at least 1 entries/);
  });

  it('refuses a month with no cloth on either side', () => {
    expect(() => splitVariance([{ band: 'pale', kg: 0, perKg: 1 }], plan)).toThrow(/planned kg/);
  });
});

describe('reading the split', () => {
  const actual = [
    { band: 'pale', kg: 3000, perKg: 1.2 },
    { band: 'medium', kg: 6200, perKg: 1.38 },
    { band: 'dark', kg: 1400, perKg: 1.9 },
  ];
  const variance = splitVariance(plan, actual);

  it('names the order the split was taken in', () => {
    expect(VARIANCE_ORDER).toEqual(['volume', 'mix', 'price', 'rate']);
  });

  it('ranks by size and not by sign', () => {
    const rows = ranked(variance);
    for (let i = 1; i < rows.length; i += 1) {
      expect(Math.abs(rows[i - 1].value)).toBeGreaterThanOrEqual(Math.abs(rows[i].value));
    }
  });

  it('says over or under and what drove it', () => {
    const line = describeVariance(variance);
    expect(line).toMatch(/over|under/);
    expect(line).toMatch(/mostly (volume|mix|rate)/);
  });

  it('calls a cheaper month under', () => {
    const cheaper = splitVariance(
      plan,
      plan.map((row) => ({ ...row, perKg: row.perKg * 0.9 }))
    );
    expect(describeVariance(cheaper)).toMatch(/under/);
  });

  it('takes a tighter reconciliation tolerance', () => {
    expect(reconciles(variance, { tolerance: 0 })).toBe(Math.abs(variance.unexplained) === 0);
  });
});

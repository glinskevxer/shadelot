import { describe, expect, it } from 'vitest';
import {
  allowanceFor,
  createAllowanceBook,
  finishedGsm,
  finishedLength,
  finishedWidth,
  fitAllowance,
  greigeNeeded,
  makeAllowance,
  projectRoll,
} from '../../src/greige/shrinkage.js';

const poplin = makeAllowance({
  quality: 'cotton poplin 140gsm',
  lengthShrink: 0.06,
  widthShrink: 0.04,
});

describe('an allowance', () => {
  it('defaults to the exhaust process and no samples behind it', () => {
    expect(poplin.process).toBe('exhaust');
    expect(poplin.samples).toBe(0);
  });

  it('refuses a shrinkage nothing measures', () => {
    expect(() => makeAllowance({ quality: 'x', lengthShrink: 0.5, widthShrink: 0.04 })).toThrow(
      /lengthShrink/
    );
    expect(() => makeAllowance({ quality: 'x', lengthShrink: -0.01, widthShrink: 0.04 })).toThrow(
      /lengthShrink/
    );
  });

  it('takes a zero allowance, which is what a stabilised quality gets', () => {
    expect(makeAllowance({ quality: 'x', lengthShrink: 0, widthShrink: 0 }).lengthShrink).toBe(0);
  });
});

describe('the allowance book', () => {
  const book = createAllowanceBook([
    poplin,
    makeAllowance({
      quality: 'cotton poplin 140gsm',
      process: 'jig',
      lengthShrink: 0.03,
      widthShrink: 0.02,
    }),
    makeAllowance({ quality: 'viscose challis', lengthShrink: 0.09, widthShrink: 0.07 }),
  ]);

  it('finds the exact quality and process', () => {
    expect(allowanceFor(book, 'cotton poplin 140gsm', 'jig').lengthShrink).toBe(0.03);
  });

  it('falls back to the exhaust figure for a process with none of its own', () => {
    expect(allowanceFor(book, 'viscose challis', 'jig').lengthShrink).toBe(0.09);
  });

  it('refuses a quality nothing has been measured for', () => {
    expect(() => allowanceFor(book, 'wool flannel')).toThrow(/no shrinkage allowance recorded/);
  });

  it('refuses the same quality and process twice', () => {
    expect(() => createAllowanceBook([poplin, poplin])).toThrow(/recorded twice/);
  });
});

describe('what comes out', () => {
  it('is shorter and narrower than what went in', () => {
    expect(finishedLength(100, poplin)).toBeCloseTo(94, 9);
    expect(finishedWidth(150, poplin)).toBeCloseTo(144, 9);
  });

  it('is heavier per square metre without gaining a gram', () => {
    expect(finishedGsm(140, poplin)).toBeCloseTo(140 / (0.94 * 0.96), 6);
    expect(finishedGsm(140, poplin)).toBeGreaterThan(140);
  });

  it('projects a whole roll in the terms the order was taken in', () => {
    const projected = projectRoll({ id: 'R-1', length: 100, widthCm: 150, gsm: 140 }, poplin);
    expect(projected.finishedLength).toBeCloseTo(94, 9);
    expect(projected.greigeLength).toBe(100);
    expect(projected.finishedGsm).toBeGreaterThan(projected.greigeGsm);
  });

  it('refuses a roll of no length', () => {
    expect(() => finishedLength(0, poplin)).toThrow(/greigeMetres/);
  });
});

describe('booking greige against an order', () => {
  it('books more than the order asks for', () => {
    expect(greigeNeeded(1000, poplin)).toBeGreaterThan(1000);
  });

  it('covers the shrinkage and the spoilage together', () => {
    expect(greigeNeeded(1000, poplin, { spoilage: 0 })).toBe(Math.ceil(1000 / 0.94));
    expect(greigeNeeded(1000, poplin, { spoilage: 0.05 })).toBe(Math.ceil(1000 / 0.94 / 0.95));
  });

  it('rounds up to a whole metre, since nobody cuts a part metre off a beam', () => {
    expect(Number.isInteger(greigeNeeded(1234, poplin))).toBe(true);
  });

  it('refuses a spoilage allowance nobody would sign off', () => {
    expect(() => greigeNeeded(1000, poplin, { spoilage: 0.8 })).toThrow(/spoilage/);
  });
});

describe('refitting an allowance from measurements', () => {
  const pairs = [
    { greigeLength: 100, finishedLength: 94, greigeWidthCm: 150, finishedWidthCm: 144 },
    { greigeLength: 120, finishedLength: 112.2, greigeWidthCm: 150, finishedWidthCm: 143.5 },
  ];

  it('takes the mean of the measured pairs', () => {
    const fitted = fitAllowance('cotton poplin 140gsm', pairs);
    expect(fitted.lengthShrink).toBeCloseTo((0.06 + 0.065) / 2, 6);
    expect(fitted.samples).toBe(2);
  });

  it('records the process it was fitted for', () => {
    expect(fitAllowance('x', pairs, { process: 'jig' }).process).toBe('jig');
  });

  it('refuses to fit against nothing', () => {
    expect(() => fitAllowance('x', [])).toThrow(/at least one measured roll/);
  });

  it('refuses a fit that comes out beyond what an allowance may hold', () => {
    const silly = [
      { greigeLength: 100, finishedLength: 50, greigeWidthCm: 150, finishedWidthCm: 140 },
    ];
    expect(() => fitAllowance('x', silly)).toThrow(/lengthShrink/);
  });
});

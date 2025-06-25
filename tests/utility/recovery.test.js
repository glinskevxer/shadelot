import { describe, expect, it } from 'vitest';
import {
  catchable,
  makeExchanger,
  payback,
  preheatedTo,
  recoverDay,
  recovered,
} from '../../src/utility/recovery.js';

const withTank = makeExchanger({
  id: 'HX-1',
  effectiveness: 0.65,
  maxLitresPerMinute: 300,
  tankLitres: 4000,
  coldInletC: 12,
});
const withoutTank = makeExchanger({ id: 'HX-2', effectiveness: 0.65, maxLitresPerMinute: 300 });

describe('an exchanger', () => {
  it('has no tank unless one is fitted', () => {
    expect(withoutTank.tankLitres).toBe(0);
    expect(withTank.tankLitres).toBe(4000);
  });

  it('takes the mains temperature the works actually gets', () => {
    expect(makeExchanger({ ...withTank, coldInletC: 6 }).coldInletC).toBe(6);
    expect(withoutTank.coldInletC).toBe(12);
  });

  it('refuses an effectiveness nothing achieves', () => {
    expect(() => makeExchanger({ ...withTank, effectiveness: 0.99 })).toThrow(/effectiveness/);
    expect(() => makeExchanger({ ...withTank, effectiveness: 0 })).toThrow(/effectiveness/);
  });
});

describe('what can be caught', () => {
  it('is only the overlap without a tank', () => {
    expect(catchable(withoutTank, { dropLitres: 1600, overlapLitres: 400 })).toBe(400);
    expect(catchable(withoutTank, { dropLitres: 1600 })).toBe(0);
  });

  it('is the whole drop with a tank big enough to hold it', () => {
    expect(catchable(withTank, { dropLitres: 1600 })).toBe(1600);
  });

  it('is capped by the tank on a big drop', () => {
    const small = makeExchanger({ ...withTank, tankLitres: 800 });
    expect(catchable(small, { dropLitres: 1600 })).toBe(800);
  });

  it('still takes a bigger overlap than the tank holds', () => {
    const small = makeExchanger({ ...withTank, tankLitres: 500 });
    expect(catchable(small, { dropLitres: 1600, overlapLitres: 900 })).toBe(900);
  });

  it('refuses an overlap bigger than the drop', () => {
    expect(() => catchable(withTank, { dropLitres: 1000, overlapLitres: 1200 })).toThrow(
      /overlapLitres/
    );
  });
});

describe('the heat recovered', () => {
  it('is nothing when nothing can be caught', () => {
    expect(recovered(withoutTank, { dropLitres: 1600, dropTemperature: 60 })).toBe(0);
  });

  it('rises with the temperature the bath is dropped at', () => {
    const warm = recovered(withTank, { dropLitres: 1600, dropTemperature: 60 });
    const hot = recovered(withTank, { dropLitres: 1600, dropTemperature: 95 });
    expect(hot).toBeGreaterThan(warm);
  });

  it('is nothing for a bath dropped colder than the mains', () => {
    expect(recovered(withTank, { dropLitres: 1600, dropTemperature: 8 })).toBe(0);
  });

  it('reads as a preheat temperature the fill arrives at', () => {
    expect(preheatedTo(withTank, 60)).toBeCloseTo(12 + 48 * 0.65, 6);
    expect(preheatedTo(withTank, 12)).toBe(12);
  });

  it('refuses a bath temperature off the scale', () => {
    expect(() => recovered(withTank, { dropLitres: 1600, dropTemperature: 200 })).toThrow(
      /dropTemperature/
    );
  });
});

describe('a day of drops', () => {
  const drops = [
    { batchId: 'B1', dropLitres: 1600, dropTemperature: 60, overlapLitres: 600 },
    { batchId: 'B2', dropLitres: 1200, dropTemperature: 95, overlapLitres: 0 },
    { batchId: 'B3', dropLitres: 1800, dropTemperature: 40, overlapLitres: 1800 },
  ];

  it('totals the heat and the litres', () => {
    const day = recoverDay(withTank, drops);
    expect(day.litresDropped).toBe(4600);
    expect(day.heatKwh).toBeGreaterThan(0);
    expect(day.caughtShare).toBeGreaterThan(0);
  });

  it('catches far less without a tank', () => {
    const tanked = recoverDay(withTank, drops);
    const bare = recoverDay(withoutTank, drops);
    expect(bare.litresCaught).toBeLessThan(tanked.litresCaught);
    expect(bare.heatKj).toBeLessThan(tanked.heatKj);
  });

  it('keeps a row per batch', () => {
    expect(recoverDay(withTank, drops).rows.map((row) => row.batchId)).toEqual(['B1', 'B2', 'B3']);
  });

  it('refuses a day with no drops', () => {
    expect(() => recoverDay(withTank, [])).toThrow(/at least 1 entries/);
  });
});

describe('whether it pays back', () => {
  const day = recoverDay(withTank, [
    { batchId: 'B1', dropLitres: 1600, dropTemperature: 60 },
    { batchId: 'B2', dropLitres: 1600, dropTemperature: 95 },
  ]);

  it('reports a payback in years', () => {
    const result = payback(day, { capitalCost: 28000, steamPerTonne: 34.5 });
    expect(result.years).toBeGreaterThan(0);
    expect(result.savingPerYear).toBeGreaterThan(0);
  });

  it('pays back sooner on a dearer steam price', () => {
    const cheap = payback(day, { capitalCost: 28000, steamPerTonne: 20 });
    const dear = payback(day, { capitalCost: 28000, steamPerTonne: 60 });
    expect(dear.years).toBeLessThan(cheap.years);
  });

  it('pays back sooner on a works that runs more days', () => {
    const few = payback(day, { capitalCost: 28000, steamPerTonne: 34.5, daysPerYear: 150 });
    const many = payback(day, { capitalCost: 28000, steamPerTonne: 34.5, daysPerYear: 320 });
    expect(many.years).toBeLessThan(few.years);
  });

  it('refuses to price a day that recovers nothing', () => {
    const nothing = recoverDay(withoutTank, [
      { batchId: 'B1', dropLitres: 1600, dropTemperature: 60 },
    ]);
    expect(() => payback(nothing, { capitalCost: 28000, steamPerTonne: 34.5 })).toThrow(
      /recovers nothing/
    );
  });
});

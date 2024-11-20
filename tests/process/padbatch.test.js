import { describe, expect, it } from 'vitest';
import {
  BATCH_TURNS,
  dwellCheck,
  liquorForRun,
  minimumEconomicRun,
  owfFromTrough,
  troughGpl,
  turnsFor,
  wetPickup,
} from '../../src/process/padbatch.js';

describe('wet pickup', () => {
  it('is the liquor carried per hundred of cloth', () => {
    expect(wetPickup(100, 70)).toBeCloseTo(70, 9);
    expect(wetPickup(50, 40)).toBeCloseTo(80, 9);
  });

  it('refuses a cloth or a liquor weight of nothing', () => {
    expect(() => wetPickup(0, 70)).toThrow(/clothKg/);
    expect(() => wetPickup(100, 0)).toThrow(/liquorKg/);
  });
});

describe('the trough dose', () => {
  it('turns an owf into grams per litre through the pickup', () => {
    expect(troughGpl(2, 70)).toBeCloseTo(28.571, 3);
    expect(troughGpl(2, 100)).toBeCloseTo(20, 9);
  });

  it('needs a stronger trough at a lower pickup', () => {
    expect(troughGpl(2, 50)).toBeGreaterThan(troughGpl(2, 80));
  });

  it('goes back the other way exactly', () => {
    expect(owfFromTrough(troughGpl(2.4, 65), 65)).toBeCloseTo(2.4, 9);
  });

  it('refuses a pickup nothing on a mangle produces', () => {
    expect(() => troughGpl(2, 10)).toThrow(/pickupPercent/);
    expect(() => troughGpl(2, 200)).toThrow(/pickupPercent/);
  });
});

describe('liquor for a run', () => {
  const run = { clothKg: 600, pickupPercent: 70, troughLitres: 45 };

  it('counts what goes on the cloth and what fills the trough', () => {
    const liquor = liquorForRun(run);
    expect(liquor.onClothLitres).toBeCloseTo(420, 9);
    expect(liquor.mixedLitres).toBeCloseTo(465, 9);
  });

  it('charges the residue to the run rather than spreading it', () => {
    expect(liquorForRun(run).residueLitres).toBeCloseTo(27, 9);
  });

  it('wastes a bigger share on a short run', () => {
    const short = liquorForRun({ ...run, clothKg: 60 });
    expect(short.wasteFraction).toBeGreaterThan(liquorForRun(run).wasteFraction);
  });

  it('takes a works that drains the trough further', () => {
    expect(liquorForRun({ ...run, minimumHeel: 0.2 }).residueLitres).toBeCloseTo(9, 9);
    expect(liquorForRun({ ...run, minimumHeel: 0 }).wasteFraction).toBe(0);
  });

  it('refuses a heel that is more than the trough holds', () => {
    expect(() => liquorForRun({ ...run, minimumHeel: 1.4 })).toThrow(/minimumHeel/);
  });
});

describe('the run length worth padding', () => {
  it('grows with the trough size', () => {
    const small = minimumEconomicRun({ pickupPercent: 70, troughLitres: 20 });
    const large = minimumEconomicRun({ pickupPercent: 70, troughLitres: 60 });
    expect(large).toBeGreaterThan(small);
  });

  it('falls as the works accepts more waste', () => {
    const tight = minimumEconomicRun({ pickupPercent: 70, troughLitres: 45, maximumWaste: 0.05 });
    const loose = minimumEconomicRun({ pickupPercent: 70, troughLitres: 45, maximumWaste: 0.3 });
    expect(loose).toBeLessThan(tight);
  });

  it('agrees with the liquor calculation at the boundary', () => {
    const clothKg = minimumEconomicRun({ pickupPercent: 70, troughLitres: 45, maximumWaste: 0.15 });
    const liquor = liquorForRun({ clothKg, pickupPercent: 70, troughLitres: 45 });
    expect(liquor.wasteFraction).toBeCloseTo(0.15, 6);
  });

  it('reports no minimum when the heel is already inside the accepted waste', () => {
    expect(
      minimumEconomicRun({
        pickupPercent: 70,
        troughLitres: 45,
        maximumWaste: 0.5,
        minimumHeel: 0.4,
      })
    ).toBe(0);
  });

  it('refuses a heel bigger than the trough', () => {
    expect(() =>
      minimumEconomicRun({
        pickupPercent: 70,
        troughLitres: 45,
        maximumWaste: 0.5,
        minimumHeel: 1.4,
      })
    ).toThrow(/minimumHeel/);
  });
});

describe('the dwell check', () => {
  it('passes a roll that turned long enough', () => {
    expect(dwellCheck(6).sufficient).toBe(true);
    expect(dwellCheck(6).shortBy).toBe(0);
  });

  it('says how short a roll came up', () => {
    const check = dwellCheck(2);
    expect(check.sufficient).toBe(false);
    expect(check.shortBy).toBeCloseTo(2, 9);
  });

  it('needs less dwell in a warm shed', () => {
    expect(dwellCheck(3, { temperature: 32 }).sufficient).toBe(true);
    expect(dwellCheck(3, { temperature: 20 }).sufficient).toBe(false);
  });

  it('takes a longer works minimum', () => {
    expect(dwellCheck(6, { minimumHours: 8 }).sufficient).toBe(false);
  });

  it('refuses a dwell of nothing', () => {
    expect(() => dwellCheck(0)).toThrow(/hoursTurned/);
  });
});

describe('batch turning speeds', () => {
  it('names the three the shed runs', () => {
    expect(turnsFor('slow')).toBe(2);
    expect(turnsFor()).toBe(BATCH_TURNS.normal);
    expect(() => turnsFor('crawling')).toThrow(/must be one of slow, normal, fast/);
  });
});

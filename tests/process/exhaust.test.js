import { describe, expect, it } from 'vitest';
import {
  FIT,
  bestConditions,
  dyeOnCloth,
  exhaustion,
  fixation,
  wasteFraction,
} from '../../src/process/exhaust.js';

const good = { saltGpl: 60, temperature: 60, liquorRatio: 8 };

describe('exhaustion', () => {
  it('sits between nothing and everything', () => {
    const value = exhaustion(good);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it('rises with salt and flattens out', () => {
    const low = exhaustion({ ...good, saltGpl: 10 });
    const mid = exhaustion({ ...good, saltGpl: 60 });
    const high = exhaustion({ ...good, saltGpl: 200 });
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(high - mid).toBeLessThan(mid - low);
  });

  it('peaks at the temperature the fit says and falls either side', () => {
    const cold = exhaustion({ ...good, temperature: 30 });
    const best = exhaustion({ ...good, temperature: FIT.temperatureOptimum });
    const hot = exhaustion({ ...good, temperature: 95 });
    expect(best).toBeGreaterThan(cold);
    expect(best).toBeGreaterThan(hot);
  });

  it('falls as the bath gets longer', () => {
    expect(exhaustion({ ...good, liquorRatio: 16 })).toBeLessThan(exhaustion(good));
    expect(exhaustion({ ...good, liquorRatio: 5 })).toBeGreaterThan(exhaustion(good));
  });

  it('is near nothing with no salt at all', () => {
    expect(exhaustion({ ...good, saltGpl: 0 })).toBeLessThan(0.01);
  });

  it('refuses conditions off the scale', () => {
    expect(() => exhaustion({ ...good, temperature: 200 })).toThrow(/temperature/);
    expect(() => exhaustion({ ...good, saltGpl: -1 })).toThrow(/saltGpl/);
    expect(() => exhaustion({ ...good, liquorRatio: 0 })).toThrow(/liquorRatio/);
  });
});

describe('fixation', () => {
  it('never reaches exhaustion, because some of it hydrolyses', () => {
    expect(fixation(good)).toBeLessThan(exhaustion(good));
  });

  it('falls the longer the batch sits after the alkali goes in', () => {
    const quick = fixation({ ...good, minutesAfterAlkali: 20 });
    const slow = fixation({ ...good, minutesAfterAlkali: 200 });
    expect(slow).toBeLessThan(quick);
  });

  it('stops falling once the hydrolysis cap is reached', () => {
    const long = fixation({ ...good, minutesAfterAlkali: 560 });
    const longer = fixation({ ...good, minutesAfterAlkali: 600 });
    expect(longer).toBeCloseTo(long, 9);
  });

  it('defaults to the works standard fix time', () => {
    expect(fixation(good)).toBeCloseTo(fixation({ ...good, minutesAfterAlkali: 45 }), 12);
  });

  it('refuses a fix time nothing runs', () => {
    expect(() => fixation({ ...good, minutesAfterAlkali: 900 })).toThrow(/minutesAfterAlkali/);
  });

  it('adds up with the waste to the whole charge', () => {
    expect(fixation(good) + wasteFraction(good)).toBeCloseTo(1, 12);
  });
});

describe('finding the best conditions', () => {
  it('lands near the temperature the fit peaks at', () => {
    const best = bestConditions({ liquorRatio: 8 });
    expect(Math.abs(best.temperature - FIT.temperatureOptimum)).toBeLessThanOrEqual(2);
  });

  it('takes the most salt the range allows, since salt only helps', () => {
    const best = bestConditions({ liquorRatio: 8, saltRange: [10, 80] });
    expect(best.saltGpl).toBe(80);
  });

  it('reports a fixation at least as good as anything on the grid', () => {
    const best = bestConditions({ liquorRatio: 8 });
    expect(best.fixation).toBeGreaterThanOrEqual(fixation({ ...good, minutesAfterAlkali: 45 }));
  });

  it('takes a narrow range and stays inside it', () => {
    const best = bestConditions({ liquorRatio: 8, temperatureRange: [40, 44] });
    expect(best.temperature).toBeLessThanOrEqual(44);
    expect(best.temperature).toBeGreaterThanOrEqual(40);
  });
});

describe('dye that reaches the cloth', () => {
  it('is the charge times the fixation', () => {
    expect(dyeOnCloth(4, good)).toBeCloseTo(4 * fixation(good), 12);
  });

  it('refuses a charge of nothing', () => {
    expect(() => dyeOnCloth(0, good)).toThrow(/dyeChargedKg/);
  });
});

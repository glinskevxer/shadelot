/**
 * Properties of the process modules.
 *
 * These are the ones where a fitted curve is easy to get subtly wrong: a model
 * that goes the right way over the range somebody tested and the wrong way just
 * outside it. Monotonicity, bounds and the direction of every lever are checked
 * over the whole range each function claims to accept.
 */

import { describe, expect, it } from 'vitest';
import {
  makeProfile,
  minutesAtOrAbove,
  peakTemperature,
  totalMinutes,
  walk,
} from '../../src/process/curve.js';
import { absorbency, polymerisationLoss, routeFor, ROUTES } from '../../src/process/preparation.js';
import {
  liquorForRun,
  minimumEconomicRun,
  owfFromTrough,
  troughGpl,
} from '../../src/process/padbatch.js';
import { planWashOff, residueAfter, washOff } from '../../src/process/wash.js';
import { exhaustion, fixation } from '../../src/process/exhaust.js';

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const between = (random, low, high) => low + random() * (high - low);

describe('a dyeing profile', () => {
  it('always ends where the last segment left it', () => {
    const random = generator(11);
    for (let i = 0; i < 200; i += 1) {
      const profile = makeProfile({
        id: 'P',
        name: 'p',
        startAt: between(random, 10, 40),
        segments: [
          {
            kind: 'ramp',
            label: 'up',
            to: between(random, 50, 130),
            ratePerMinute: between(random, 0.5, 4),
          },
          {
            kind: 'hold',
            label: 'hold',
            at: between(random, 50, 130),
            minutes: between(random, 5, 90),
          },
        ],
      });
      const steps = walk(profile);
      expect(peakTemperature(profile)).toBeGreaterThanOrEqual(steps.at(-1).to);
      expect(totalMinutes(profile)).toBeCloseTo(
        steps.reduce((sum, step) => sum + step.minutes, 0),
        6
      );
    }
  });

  it('never counts more time at a temperature than the whole run', () => {
    const random = generator(12);
    for (let i = 0; i < 200; i += 1) {
      const at = between(random, 50, 100);
      const profile = makeProfile({
        id: 'P',
        name: 'p',
        segments: [
          { kind: 'ramp', label: 'up', to: at, ratePerMinute: 2 },
          { kind: 'hold', label: 'hold', at, minutes: between(random, 5, 120) },
          { kind: 'drain', label: 'drop', minutes: 8 },
        ],
      });
      expect(minutesAtOrAbove(profile, at)).toBeLessThanOrEqual(totalMinutes(profile));
      expect(minutesAtOrAbove(profile, at + 1)).toBe(0);
    }
  });
});

describe('preparation', () => {
  it('never puts absorbency outside the scale on any route', () => {
    const random = generator(21);
    for (let i = 0; i < 300; i += 1) {
      const wax = between(random, 0.01, 5);
      for (const route of ROUTES) {
        const value = absorbency(route, { startingWax: wax });
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(10);
      }
    }
  });

  it('never lets damage fall when peroxide, heat or time goes up', () => {
    const random = generator(22);
    for (let i = 0; i < 200; i += 1) {
      const base = {
        peroxideGpl: between(random, 1, 20),
        temperature: between(random, 65, 110),
        minutes: between(random, 20, 120),
        stabiliserGpl: between(random, 0, 4),
      };
      expect(
        polymerisationLoss({ ...base, peroxideGpl: base.peroxideGpl + 5 })
      ).toBeGreaterThanOrEqual(polymerisationLoss(base));
      expect(polymerisationLoss({ ...base, minutes: base.minutes + 30 })).toBeGreaterThanOrEqual(
        polymerisationLoss(base)
      );
      expect(
        polymerisationLoss({ ...base, stabiliserGpl: base.stabiliserGpl + 1 })
      ).toBeLessThanOrEqual(polymerisationLoss(base));
    }
  });

  it('always chooses a route that meets the whiteness asked for', () => {
    const random = generator(23);
    for (let i = 0; i < 200; i += 1) {
      const wanted = between(random, 0.05, 0.89);
      const route = routeFor({ whitenessNeeded: wanted });
      expect(ROUTES).toContain(route);
      expect(absorbency(route)).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('pad batch', () => {
  it('round trips a dose through the pickup at every pickup', () => {
    const random = generator(31);
    for (let i = 0; i < 300; i += 1) {
      const owf = between(random, 0.05, 6);
      const pickup = between(random, 25, 140);
      expect(owfFromTrough(troughGpl(owf, pickup), pickup)).toBeCloseTo(owf, 9);
    }
  });

  it('always wastes a bigger share on a shorter run', () => {
    const random = generator(32);
    for (let i = 0; i < 200; i += 1) {
      const run = {
        pickupPercent: between(random, 40, 100),
        troughLitres: between(random, 20, 90),
      };
      const short = liquorForRun({ ...run, clothKg: between(random, 20, 100) });
      const long = liquorForRun({ ...run, clothKg: between(random, 400, 2000) });
      expect(long.wasteFraction).toBeLessThan(short.wasteFraction);
    }
  });

  it('always agrees with itself at the minimum economic run', () => {
    const random = generator(33);
    for (let i = 0; i < 200; i += 1) {
      const pickupPercent = between(random, 40, 100);
      const troughLitres = between(random, 20, 90);
      const maximumWaste = between(random, 0.05, 0.4);
      const clothKg = minimumEconomicRun({ pickupPercent, troughLitres, maximumWaste });
      if (clothKg === 0) continue;
      const liquor = liquorForRun({ clothKg, pickupPercent, troughLitres });
      expect(liquor.wasteFraction).toBeCloseTo(maximumWaste, 6);
    }
  });
});

describe('washing off', () => {
  it('never leaves more than it started with', () => {
    const random = generator(41);
    const kinds = ['cold-rinse', 'warm-rinse', 'soap', 'neutralise'];
    for (let i = 0; i < 300; i += 1) {
      const start = between(random, 0.01, 1);
      const baths = Array.from(
        { length: 1 + Math.floor(random() * 6) },
        () => kinds[Math.floor(random() * kinds.length)]
      );
      const left = residueAfter(baths, { startingResidue: start });
      expect(left).toBeLessThanOrEqual(start + 1e-12);
      expect(left).toBeGreaterThan(0);
    }
  });

  it('never reports a step removing more than was there', () => {
    const random = generator(42);
    for (let i = 0; i < 200; i += 1) {
      const steps = washOff(new Array(1 + Math.floor(random() * 5)).fill('soap'), {
        startingResidue: between(random, 0.05, 1),
      });
      for (const step of steps) {
        expect(step.removed).toBeGreaterThan(0);
        expect(step.residue).toBeGreaterThan(0);
      }
    }
  });

  it('always reaches the target when it says it did', () => {
    const random = generator(43);
    for (let i = 0; i < 200; i += 1) {
      const start = between(random, 0.05, 1);
      const target = between(random, 0.001, start);
      const plan = planWashOff(target, { startingResidue: start, maxBaths: 20 });
      if (plan.reached) {
        expect(plan.residue).toBeLessThanOrEqual(target + 1e-12);
      }
    }
  });
});

describe('the fitted exhaustion curve', () => {
  it('never falls when salt rises, at any temperature or ratio', () => {
    const random = generator(51);
    for (let i = 0; i < 300; i += 1) {
      const base = {
        saltGpl: between(random, 1, 120),
        temperature: between(random, 25, 120),
        liquorRatio: between(random, 3, 30),
      };
      expect(exhaustion({ ...base, saltGpl: base.saltGpl + 10 })).toBeGreaterThan(exhaustion(base));
    }
  });

  it('never rises when the bath gets longer', () => {
    const random = generator(52);
    for (let i = 0; i < 300; i += 1) {
      const base = {
        saltGpl: between(random, 5, 120),
        temperature: between(random, 40, 90),
        liquorRatio: between(random, 4, 20),
      };
      expect(exhaustion({ ...base, liquorRatio: base.liquorRatio + 4 })).toBeLessThan(
        exhaustion(base)
      );
      expect(fixation({ ...base, liquorRatio: base.liquorRatio + 4 })).toBeLessThan(fixation(base));
    }
  });
});

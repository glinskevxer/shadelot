import { describe, expect, it } from 'vitest';
import {
  DP_FLOOR,
  REMOVAL,
  ROUTES,
  absorbency,
  judgePreparation,
  polymerisationLoss,
  removalFor,
  routeFor,
} from '../../src/process/preparation.js';

const gentle = { peroxideGpl: 6, temperature: 95, minutes: 45, stabiliserGpl: 1.2 };
const harsh = { peroxideGpl: 20, temperature: 110, minutes: 90, stabiliserGpl: 0 };

describe('the routes', () => {
  it('name the four this works runs', () => {
    expect(ROUTES).toEqual(['scour-only', 'scour-bleach', 'bleach-only', 'bio-scour']);
    expect(Object.keys(REMOVAL)).toEqual(ROUTES);
  });

  it('take off different things', () => {
    expect(removalFor('bio-scour').pectin).toBeGreaterThan(removalFor('scour-only').pectin);
    expect(removalFor('bleach-only').wax).toBeLessThan(removalFor('scour-only').wax);
  });

  it('refuse a route nothing runs', () => {
    expect(() => removalFor('mercerise')).toThrow(/route/);
  });
});

describe('absorbency', () => {
  it('is high after a scour and low after a bleach alone', () => {
    expect(absorbency('scour-bleach')).toBeGreaterThan(absorbency('bleach-only'));
  });

  it('never leaves the nought to ten scale', () => {
    for (const route of ROUTES) {
      expect(absorbency(route)).toBeGreaterThanOrEqual(0);
      expect(absorbency(route)).toBeLessThanOrEqual(10);
    }
  });

  it('falls when the cloth starts waxier', () => {
    expect(absorbency('bleach-only', { startingWax: 2 })).toBeLessThan(absorbency('bleach-only'));
  });

  it('refuses a wax figure nothing measures', () => {
    expect(() => absorbency('scour-only', { startingWax: 9 })).toThrow(/startingWax/);
  });
});

describe('the damage', () => {
  it('is nothing without peroxide', () => {
    expect(polymerisationLoss({ ...gentle, peroxideGpl: 0 })).toBe(0);
  });

  it('is nothing at a temperature the peroxide does nothing at', () => {
    expect(polymerisationLoss({ ...gentle, temperature: 50 })).toBe(0);
  });

  it('rises with peroxide, heat and time together', () => {
    expect(polymerisationLoss(harsh)).toBeGreaterThan(polymerisationLoss(gentle));
    expect(polymerisationLoss({ ...gentle, minutes: 180 })).toBeGreaterThan(
      polymerisationLoss(gentle)
    );
  });

  it('falls sharply with a stabiliser', () => {
    expect(polymerisationLoss({ ...harsh, stabiliserGpl: 3 })).toBeLessThan(
      polymerisationLoss(harsh)
    );
  });

  it('is capped, because a bath cannot dissolve the cloth entirely', () => {
    expect(
      polymerisationLoss({ peroxideGpl: 40, temperature: 145, minutes: 600 })
    ).toBeLessThanOrEqual(0.6);
  });

  it('refuses conditions off the scale', () => {
    expect(() => polymerisationLoss({ ...gentle, peroxideGpl: 80 })).toThrow(/peroxideGpl/);
    expect(() => polymerisationLoss({ ...gentle, minutes: 0 })).toThrow(/minutes/);
  });
});

describe('judging a preparation', () => {
  it('passes a scour and bleach run gently', () => {
    const result = judgePreparation('scour-bleach', gentle);
    expect(result.verdict).toBe('pass');
    expect(result.problems).toEqual([]);
  });

  it('fails a bleach only run for absorbency', () => {
    const result = judgePreparation('bleach-only', gentle);
    expect(result.verdict).toBe('fail');
    expect(result.problems[0]).toMatch(/absorbency of/);
  });

  it('fails a harsh bleach for damage even when the cloth wets out', () => {
    const result = judgePreparation('scour-bleach', harsh);
    expect(
      result.problems.some((problem) => problem.match(/lost .* percent of its strength/))
    ).toBe(true);
  });

  it('reports both problems when both are present', () => {
    expect(judgePreparation('bleach-only', harsh).problems).toHaveLength(2);
  });

  it('takes a route with no bleach at all', () => {
    const result = judgePreparation('scour-only', null);
    expect(result.damage).toBe(0);
    expect(result.verdict).toBe('pass');
  });

  it('takes a tighter damage limit', () => {
    expect(DP_FLOOR).toBe(0.12);
    expect(judgePreparation('scour-bleach', gentle, { damageLimit: 0.01 }).verdict).toBe('fail');
  });
});

describe('choosing a route', () => {
  it('takes the gentlest that meets the whiteness', () => {
    expect(routeFor({ whitenessNeeded: 0.1 })).toBe('bio-scour');
    expect(routeFor({ whitenessNeeded: 0.12 })).toBe('scour-only');
    expect(routeFor({ whitenessNeeded: 0.88 })).toBe('scour-bleach');
  });

  it('will not choose one that cannot wet the cloth out', () => {
    expect(routeFor({ whitenessNeeded: 0.8 })).not.toBe('bleach-only');
  });

  it('defaults to a middling whiteness requirement', () => {
    expect(ROUTES).toContain(routeFor());
  });

  it('says so when nothing this works runs will do it', () => {
    expect(() => routeFor({ whitenessNeeded: 0.99 })).toThrow(/cannot be met by any route/);
  });

  it('refuses a whiteness outside nought to one', () => {
    expect(() => routeFor({ whitenessNeeded: 1.4 })).toThrow(/whitenessNeeded/);
  });
});

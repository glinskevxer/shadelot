/**
 * Preparation.
 *
 * Nothing dyes level on badly prepared cloth, and most of what gets blamed on
 * the dyeing happened before the dye went in. Greige cotton carries size, wax,
 * pectin and seed, and taking it off is a scour and a bleach with a peroxide
 * that has to be stabilised or it eats the cloth instead of the impurities.
 *
 * The two numbers the floor watches are absorbency, which says whether the wax
 * is off, and degree of polymerisation, which says whether the peroxide went
 * too far. They move in opposite directions with the same lever.
 */

import {
  FieldError,
  requireInRange,
  requireOneOf,
  requirePositive,
  optional,
} from '../valid/guards.js';

export const ROUTES = ['scour-only', 'scour-bleach', 'bleach-only', 'bio-scour'];

/** What each route takes off, as a share of the impurity it starts with. */
export const REMOVAL = Object.freeze({
  'scour-only': { wax: 0.9, pectin: 0.7, seed: 0.2, whitening: 0.15 },
  'scour-bleach': { wax: 0.95, pectin: 0.9, seed: 0.85, whitening: 0.9 },
  'bleach-only': { wax: 0.4, pectin: 0.5, seed: 0.8, whitening: 0.85 },
  'bio-scour': { wax: 0.75, pectin: 0.95, seed: 0.1, whitening: 0.1 },
});

export function removalFor(route) {
  const removal = REMOVAL[requireOneOf(route, 'route', ROUTES)];
  return removal;
}

/**
 * Absorbency after preparation, on the works nought to ten scale where six is
 * the floor for a level dyeing. It is driven by the wax that came off.
 */
export function absorbency(route, { startingWax = 0.6 } = {}) {
  requireInRange(startingWax, 'startingWax', 0, 5);
  const removal = removalFor(route);
  const left = startingWax * (1 - removal.wax);
  return Math.max(0, Math.min(10, 10 - left * 12));
}

/**
 * Damage from the bleach, as a fall in degree of polymerisation. Peroxide at
 * temperature with no stabiliser attacks the cellulose, and the alkali makes it
 * worse rather than better.
 */
export function polymerisationLoss({ peroxideGpl, temperature, minutes, stabiliserGpl = 0 }) {
  requireInRange(peroxideGpl, 'peroxideGpl', 0, 40);
  requireInRange(temperature, 'temperature', 20, 145);
  requirePositive(minutes, 'minutes');
  requireInRange(stabiliserGpl, 'stabiliserGpl', 0, 10);
  const heat = Math.max(0, temperature - 60) / 40;
  const exposure = (peroxideGpl / 10) * heat * (minutes / 60);
  const protection = 1 / (1 + stabiliserGpl * 1.4);
  return Math.min(0.6, exposure * protection * 0.35);
}

export const DP_FLOOR = 0.12;

/**
 * Judge a preparation. Both numbers have to be met and they pull against each
 * other, which is why this returns them together rather than one at a time.
 */
export function judgePreparation(
  route,
  bleach,
  { absorbencyFloor = 6, damageLimit = DP_FLOOR } = {}
) {
  requireInRange(absorbencyFloor, 'absorbencyFloor', 0, 10);
  requireInRange(damageLimit, 'damageLimit', 0.01, 1);
  const wetting = absorbency(route);
  const damage = bleach === null ? 0 : polymerisationLoss(bleach);
  const problems = [];
  if (wetting < absorbencyFloor) {
    problems.push(`absorbency of ${wetting.toFixed(1)} is below the floor of ${absorbencyFloor}`);
  }
  if (damage > damageLimit) {
    problems.push(`the cloth lost ${(damage * 100).toFixed(1)} percent of its strength`);
  }
  return {
    route,
    absorbency: wetting,
    damage,
    verdict: problems.length === 0 ? 'pass' : 'fail',
    problems,
  };
}

/**
 * The cheapest route that meets a whiteness requirement. Bleaching costs money
 * and damage, so a shade dark enough to cover the seed does not need one.
 */
export function routeFor({ whitenessNeeded, absorbencyFloor = 6 } = {}) {
  requireInRange(optional(whitenessNeeded, Number, 0.5), 'whitenessNeeded', 0, 1);
  const wanted = optional(whitenessNeeded, Number, 0.5);
  const usable = ROUTES.filter(
    (route) => REMOVAL[route].whitening >= wanted && absorbency(route) >= absorbencyFloor
  );
  if (usable.length === 0) {
    throw new FieldError('whitenessNeeded', 'cannot be met by any route this works runs', wanted);
  }
  return usable.reduce((best, route) =>
    REMOVAL[route].whitening < REMOVAL[best].whitening ? route : best
  );
}

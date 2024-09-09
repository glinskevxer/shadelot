/**
 * Exhaustion and fixation.
 *
 * Two different things that get called the same thing on the floor. Exhaustion
 * is how much dye left the bath. Fixation is how much of it formed a bond and
 * survived the soaping. The gap between them is the hydrolysed dye, which is
 * paid for, dyed with, and then washed straight down the drain.
 *
 * The model is a works fit and not chemistry. It is here so the planner has a
 * number that is at least consistent, and every coefficient is named and can be
 * refitted against the works records.
 */

import { requireInRange, requirePositive, optional } from '../valid/guards.js';

/** Coefficients fitted against two years of this works' own bath samples. */
export const FIT = Object.freeze({
  saltHalfPoint: 45,
  saltShape: 1.6,
  temperatureOptimum: 60,
  temperatureWidth: 22,
  ratioReference: 8,
  ratioShape: 0.35,
  fixationCeiling: 0.82,
  hydrolysisPerMinute: 0.0009,
});

function saturating(value, half, shape) {
  const scaled = (value / half) ** shape;
  return scaled / (1 + scaled);
}

function bell(value, centre, width) {
  return Math.exp(-(((value - centre) / width) ** 2));
}

/**
 * Exhaustion, as a fraction of the dye that left the bath. Salt drives it,
 * temperature has an optimum, and a longer bath works against it because the
 * dye has more liquor to stay in.
 */
export function exhaustion({ saltGpl, temperature, liquorRatio }, fit = FIT) {
  requireInRange(saltGpl, 'saltGpl', 0, 400);
  requireInRange(temperature, 'temperature', 0, 145);
  requirePositive(liquorRatio, 'liquorRatio');
  const bySalt = saturating(Math.max(saltGpl, 0.001), fit.saltHalfPoint, fit.saltShape);
  const byTemperature = bell(temperature, fit.temperatureOptimum, fit.temperatureWidth);
  const byRatio = (fit.ratioReference / liquorRatio) ** fit.ratioShape;
  return Math.min(0.99, bySalt * byTemperature * byRatio);
}

/**
 * Fixation, which is exhaustion less what hydrolysed while the batch sat in an
 * alkaline bath. It can never reach exhaustion and it falls with time at
 * temperature after the alkali goes in.
 */
export function fixation(conditions, fit = FIT) {
  const minutesAfterAlkali = optional(
    conditions.minutesAfterAlkali,
    (v) => requireInRange(v, 'minutesAfterAlkali', 0, 600),
    45
  );
  const exhausted = exhaustion(conditions, fit);
  const hydrolysed = Math.min(0.5, minutesAfterAlkali * fit.hydrolysisPerMinute);
  return Math.max(0, exhausted * fit.fixationCeiling * (1 - hydrolysed));
}

/** The dye that was paid for and went down the drain, as a fraction. */
export function wasteFraction(conditions, fit = FIT) {
  return 1 - fixation(conditions, fit);
}

/**
 * The conditions that give the best fixation for a bath, searched over salt and
 * temperature on the grid the machine can actually hold.
 */
export function bestConditions(
  { liquorRatio, saltRange = [10, 100], temperatureRange = [40, 90] },
  fit = FIT
) {
  requirePositive(liquorRatio, 'liquorRatio');
  let best = null;
  for (let salt = saltRange[0]; salt <= saltRange[1]; salt += 5) {
    for (
      let temperature = temperatureRange[0];
      temperature <= temperatureRange[1];
      temperature += 2
    ) {
      const value = fixation({ saltGpl: salt, temperature, liquorRatio }, fit);
      if (best === null || value > best.fixation) {
        best = { saltGpl: salt, temperature, liquorRatio, fixation: value };
      }
    }
  }
  return best;
}

/** How much of the recipe reaches the cloth, in kilograms. */
export function dyeOnCloth(dyeChargedKg, conditions, fit = FIT) {
  requirePositive(dyeChargedKg, 'dyeChargedKg');
  return dyeChargedKg * fixation(conditions, fit);
}

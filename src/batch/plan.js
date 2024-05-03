/**
 * Planning a batch onto a machine.
 *
 * The recipe asks for a liquor ratio. The machine gives whatever ratio the load
 * happens to land on. When they disagree the recipe has to be re-dosed against
 * the ratio the machine will really run, and the grams per litre lines move
 * while the percent on weight lines do not. Getting that half right is the
 * classic way to dye a half load light.
 */

import {
  FieldError,
  requireArray,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';
import { bathVolume, liquorRatioAt } from '../machine/register.js';
import { buildCard } from '../recipe/card.js';

export const FIT_REASONS = ['below-minimum', 'above-maximum', 'wrong-process', 'ok'];

/** Whether a load can go on a machine at all, and why not when it cannot. */
export function assessFit(machine, recipe, fibreKg) {
  requirePositive(fibreKg, 'fibreKg');
  if (!machine.processes.includes(recipe.process)) {
    return { fits: false, reason: 'wrong-process' };
  }
  if (fibreKg < machine.minLoadKg) {
    return { fits: false, reason: 'below-minimum' };
  }
  if (fibreKg > machine.maxLoadKg) {
    return { fits: false, reason: 'above-maximum' };
  }
  return { fits: true, reason: 'ok' };
}

/**
 * How far the machine's ratio sits from the one the recipe was written for, as
 * a signed fraction. Positive means a longer bath than intended, which dilutes
 * every grams per litre line.
 */
export function ratioDrift(machine, recipe, fibreKg) {
  return (liquorRatioAt(machine, fibreKg) - recipe.liquorRatio) / recipe.liquorRatio;
}

/**
 * Re-dose the recipe against the ratio the machine will run. Percent on weight
 * lines are untouched. Grams per litre lines are scaled so the mass of chemical
 * in the bath stays what the recipe intended.
 */
export function redoseForRatio(recipe, actualRatio) {
  requirePositive(actualRatio, 'actualRatio');
  const factor = recipe.liquorRatio / actualRatio;
  const auxiliaries = recipe.auxiliaries.map((auxiliary) =>
    auxiliary.basis === 'gpl' ? { ...auxiliary, dose: auxiliary.dose * factor } : { ...auxiliary }
  );
  return Object.freeze({
    ...recipe,
    liquorRatio: actualRatio,
    auxiliaries: Object.freeze(auxiliaries.map((a) => Object.freeze(a))),
  });
}

export function planBatch(input, context) {
  const id = requireText(input.id, 'batch.id', { maxLength: 24 });
  const machine = input.machine;
  const recipe = input.recipe;
  const lots = requireArray(input.lots, 'batch.lots', { min: 1 });
  const fibreKg = lots.reduce((sum, lot) => sum + lot.mass, 0);
  const fit = assessFit(machine, recipe, fibreKg);
  if (!fit.fits) {
    throw new FieldError('batch.lots', `total ${fibreKg.toFixed(1)} kg is ${fit.reason}`, fibreKg);
  }
  const actualRatio = liquorRatioAt(machine, fibreKg);
  const tolerance = optional(
    input.ratioTolerance,
    (v) => requirePositive(v, 'ratioTolerance'),
    0.05
  );
  const drift = ratioDrift(machine, recipe, fibreKg);
  const dosed = Math.abs(drift) > tolerance ? redoseForRatio(recipe, actualRatio) : recipe;

  return Object.freeze({
    id,
    machineId: machine.id,
    recipeId: recipe.id,
    lotIds: Object.freeze(lots.map((lot) => lot.id)),
    fibreKg,
    litres: bathVolume(machine, fibreKg),
    plannedRatio: recipe.liquorRatio,
    actualRatio,
    ratioDrift: drift,
    redosed: dosed !== recipe,
    card: buildCard(dosed, fibreKg, context),
  });
}

/** Fill factor, which is the number the planner is judged on at the end of a week. */
export function fillFactor(machine, fibreKg) {
  requirePositive(fibreKg, 'fibreKg');
  return fibreKg / machine.maxLoadKg;
}

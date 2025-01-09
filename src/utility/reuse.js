/**
 * Reusing a bath.
 *
 * A dye bath that has exhausted still holds salt, alkali and the dye that never
 * went on, and reusing it saves the water, the heat and most of the salt. It
 * also carries the last shade forward, so it can only be reused going darker and
 * only within a family.
 *
 * The saving is real and the risk is real, and the decision is worth writing
 * down because it is made at eleven at night by somebody who wants to go home.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requireOneOf,
  requirePositive,
  optional,
} from '../valid/guards.js';
import { shadeFamily } from '../recipe/recipe.js';

export const VERDICTS = ['reuse', 'reuse-with-correction', 'drop'];

export const DEFAULTS = Object.freeze({
  maximumReuses: 3,
  minimumDepthStep: 1.15,
  saltRecovery: 0.85,
  residualDyeCarry: 0.6,
});

/**
 * What is left in a bath after a dyeing. Salt and alkali barely leave; the dye
 * that did not exhaust is still there and is what makes the next shade move.
 */
export function residual(bath, { fixation = 0.75, settings = DEFAULTS } = {}) {
  requireInRange(fixation, 'fixation', 0, 1);
  requirePositive(bath.litres, 'bath.litres');
  return {
    litres: bath.litres,
    saltGpl: bath.saltGpl * settings.saltRecovery,
    alkaliGpl: bath.alkaliGpl * settings.saltRecovery,
    dyeOwf: bath.dyeOwf * (1 - fixation) * settings.residualDyeCarry,
    reuses: optional(bath.reuses, Number, 0),
  };
}

/**
 * Whether the next batch can go in this bath. The tests read in order and the
 * first that answers decides, because a family mismatch is not made acceptable
 * by a big enough depth step.
 */
export function assessReuse(previous, next, { settings = DEFAULTS, residualDyeOwf = 0 } = {}) {
  const reuses = optional(previous.reuses, Number, 0);
  if (reuses >= settings.maximumReuses) {
    return { verdict: 'drop', reason: `the bath has already been reused ${reuses} times` };
  }
  if (previous.dyeClass !== next.dyeClass) {
    return { verdict: 'drop', reason: 'the dye class changes' };
  }
  if (shadeFamily(previous) !== shadeFamily(next)) {
    return { verdict: 'drop', reason: 'the two shades are not in one family' };
  }
  if (next.totalOwf < previous.totalOwf * settings.minimumDepthStep) {
    return {
      verdict: 'drop',
      reason: `the next shade is not enough darker, it needs at least ${(previous.totalOwf * settings.minimumDepthStep).toFixed(3)} percent`,
    };
  }
  if (residualDyeOwf > 0) {
    return {
      verdict: 'reuse-with-correction',
      reason: `the bath already carries ${residualDyeOwf.toFixed(4)} percent, take it off the charge`,
    };
  }
  return { verdict: 'reuse', reason: 'same family, going darker, inside the reuse count' };
}

/** The charge for the next batch, less what the bath already holds. */
export function correctedCharge(recipe, residualDyeOwf) {
  requireInRange(residualDyeOwf, 'residualDyeOwf', 0, recipe.totalOwf);
  const factor = 1 - residualDyeOwf / recipe.totalOwf;
  return recipe.dyes.map((dye) => ({
    code: dye.code,
    owf: dye.owf * factor,
    fromBath: dye.owf * (1 - factor),
  }));
}

/** What a reuse saves, in the units the utility account is kept in. */
export function savingFrom(residualBath, { waterPerCubicMetre = 1.4, saltPerKg = 0.12 } = {}) {
  requirePositive(waterPerCubicMetre, 'waterPerCubicMetre');
  requirePositive(saltPerKg, 'saltPerKg');
  const cubicMetres = residualBath.litres / 1000;
  const saltKg = (residualBath.litres * residualBath.saltGpl) / 1000;
  return {
    waterM3: cubicMetres,
    saltKg,
    value: cubicMetres * waterPerCubicMetre + saltKg * saltPerKg,
  };
}

/** The longest run of batches that could share one bath, in the order given. */
export function reuseChain(recipes, options = {}) {
  requireArray(recipes, 'recipes', { min: 1 });
  const chain = [recipes[0]];
  for (const recipe of recipes.slice(1)) {
    const previous = { ...chain.at(-1), reuses: chain.length - 1 };
    const assessment = assessReuse(previous, recipe, options);
    if (assessment.verdict === 'drop') break;
    chain.push(recipe);
  }
  return chain.map((recipe) => recipe.id);
}

export function requireVerdict(value) {
  return requireOneOf(value, 'verdict', VERDICTS);
}

export function settingsFrom(input) {
  const settings = { ...DEFAULTS, ...(input ?? {}) };
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof settings[key] !== 'number' || settings[key] <= 0) {
      throw new FieldError(`settings.${key}`, 'must be a positive number', settings[key]);
    }
  }
  return Object.freeze(settings);
}

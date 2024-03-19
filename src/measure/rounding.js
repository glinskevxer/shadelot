/**
 * Rounding to what the floor can actually weigh out.
 *
 * A recipe that calls for 0.0034 kg of a dye is a recipe nobody can dispense.
 * Every balance and every dosing pump has a resolution, and the recipe has to
 * be rounded to it before it is printed, not after the operator has guessed.
 *
 * Rounding half away from zero is deliberate. Banker's rounding spreads error
 * out nicely over a long run, but a dyer reading 0.125 rounded to 0.12 on one
 * card and 0.13 on the next will not trust either card again.
 */

import { requireNonNegative, requirePositive } from '../valid/guards.js';

export function roundHalfUp(value, decimals = 0) {
  requireNonNegative(decimals, 'decimals');
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON * 4);
  return rounded / factor;
}

/** Round to the nearest multiple of a step, which is how a balance behaves. */
export function roundToStep(value, step) {
  requirePositive(step, 'step');
  const steps = value / step;
  const rounded = Math.sign(steps) * Math.round(Math.abs(steps) + Number.EPSILON * 4);
  return cleanFloat(rounded * step);
}

/** Round upwards to a step, for anything that must not come up short. */
export function ceilToStep(value, step) {
  requirePositive(step, 'step');
  return cleanFloat(Math.ceil(value / step - Number.EPSILON * 4) * step);
}

/** Round downwards to a step, for anything drawn from a stock that must not go negative. */
export function floorToStep(value, step) {
  requirePositive(step, 'step');
  return cleanFloat(Math.floor(value / step + Number.EPSILON * 4) * step);
}

/**
 * Binary floating point leaves 0.30000000000000004 lying around after a
 * multiply. The step is always a decimal quantity in this trade, so re-reading
 * the result at twelve places is safe and gets rid of the tail.
 */
function cleanFloat(value) {
  return Number.parseFloat(value.toPrecision(12));
}

/** The resolutions the dispensary actually has, smallest first. */
export const BALANCE_STEPS = Object.freeze({
  analytical: 0.0001,
  dispensary: 0.001,
  bulk: 0.01,
  drum: 0.1,
});

export function balanceStep(name) {
  const step = BALANCE_STEPS[name];
  if (step === undefined) {
    throw new RangeError(`unknown balance "${name}", expected one of ${balanceNames().join(', ')}`);
  }
  return step;
}

export function balanceNames() {
  return Object.keys(BALANCE_STEPS);
}

/**
 * Round a dispense to the finest balance that can hold it without the rounding
 * moving the number by more than the tolerance, and say which balance that was.
 */
export function dispensable(value, { tolerance = 0.02 } = {}) {
  requireNonNegative(value, 'value');
  requirePositive(tolerance, 'tolerance');
  if (value === 0) {
    return { amount: 0, balance: 'analytical', shortfall: 0 };
  }
  for (const name of balanceNames().slice().reverse()) {
    const step = BALANCE_STEPS[name];
    const amount = roundToStep(value, step);
    if (amount > 0 && Math.abs(amount - value) / value <= tolerance) {
      return { amount, balance: name, shortfall: cleanFloat(amount - value) };
    }
  }
  const step = BALANCE_STEPS.analytical;
  const amount = roundToStep(value, step);
  return { amount, balance: 'analytical', shortfall: cleanFloat(amount - value) };
}

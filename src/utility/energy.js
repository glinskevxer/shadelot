/**
 * Steam and electricity.
 *
 * Heating a bath is the largest single line on a dyehouse energy bill and it is
 * almost entirely predictable: the specific heat of water times the mass times
 * the rise, plus what the machine loses while it holds. The losses are the part
 * that has to be measured rather than derived, so each machine carries its own
 * loss rate and nothing here pretends to calculate one.
 */

import { requireNonNegative, requirePositive, optional } from '../valid/guards.js';
import { walk } from '../process/curve.js';

/** Kilojoules to lift one kilogram of water by one degree. */
export const SPECIFIC_HEAT_WATER = 4.186;

/** Kilojoules in a kilowatt hour. */
export const KJ_PER_KWH = 3600;

export function heatingEnergyKj(litres, fromC, toC) {
  requirePositive(litres, 'litres');
  requireNonNegative(fromC, 'fromC');
  requireNonNegative(toC, 'toC');
  if (toC <= fromC) return 0;
  return litres * SPECIFIC_HEAT_WATER * (toC - fromC);
}

/** What the machine loses standing at a temperature, from its own measured rate. */
export function standingLossKj(machine, temperature, minutes, { ambient = 20 } = {}) {
  requireNonNegative(minutes, 'minutes');
  const rate = optional(
    machine.lossKwPerDegree,
    (v) => requirePositive(v, 'machine.lossKwPerDegree'),
    0
  );
  const rise = Math.max(0, temperature - ambient);
  return rate * rise * (minutes / 60) * KJ_PER_KWH;
}

/**
 * Walk a profile and total the heat. Cooling is free on this floor because it
 * is done by dropping the bath and filling cold, which shows up in the water
 * account instead.
 */
export function profileEnergy(profile, { litres, machine = {}, ambient = 20 }) {
  requirePositive(litres, 'litres');
  const steps = walk(profile);
  let heating = 0;
  let standing = 0;
  for (const step of steps) {
    if (step.kind === 'ramp' && step.to > step.from) {
      heating += heatingEnergyKj(litres, step.from, step.to);
    }
    standing += standingLossKj(machine, step.to, step.minutes, { ambient });
  }
  const total = heating + standing;
  return {
    heatingKj: heating,
    standingKj: standing,
    totalKj: total,
    totalKwh: total / KJ_PER_KWH,
  };
}

/** Pump and circulation electricity, which is a flat draw for the run. */
export function motorEnergyKwh(machine, minutes) {
  requireNonNegative(minutes, 'minutes');
  const kw = optional(machine.motorKw, (v) => requirePositive(v, 'machine.motorKw'), 0);
  return (kw * minutes) / 60;
}

/** Everything a batch draws, in the two units the bills arrive in. */
export function batchEnergy(profile, context) {
  const heat = profileEnergy(profile, context);
  const steps = walk(profile);
  const minutes = steps.length === 0 ? 0 : steps.at(-1).elapsed;
  const motor = motorEnergyKwh(context.machine ?? {}, minutes);
  return {
    ...heat,
    motorKwh: motor,
    minutes,
    steamKgEquivalent: heat.totalKj / 2200,
  };
}

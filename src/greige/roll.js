/**
 * A greige roll as it comes off the delivery vehicle.
 *
 * Greige is undyed, unfinished cloth. The weaver's docket says one thing, the
 * goods inwards balance says another, and the difference is normal rather than
 * a fault. Both numbers are kept because the customer is invoiced on one and
 * the recipe is dosed on the other.
 */

import {
  requireInRange,
  requireNonNegative,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';
import { rollDryMass } from '../measure/fabric.js';

export const FIBRES = [
  'cotton',
  'viscose',
  'polyester',
  'polyamide',
  'wool',
  'acrylic',
  'elastane',
];

export const CONSTRUCTIONS = ['woven', 'weft-knit', 'warp-knit', 'yarn'];

/**
 * Blends are given as whole percentages that must total a hundred. A blend
 * that totals 99 is a typing error, not a rounding one, because a mill spec
 * never writes a fractional fibre share.
 */
export function normaliseBlend(blend) {
  if (typeof blend !== 'object' || blend === null || Array.isArray(blend)) {
    throw new TypeError('blend must be an object of fibre to percentage');
  }
  const entries = Object.entries(blend);
  if (entries.length === 0) {
    throw new RangeError('blend must name at least one fibre');
  }
  const out = {};
  let total = 0;
  for (const [fibre, share] of entries) {
    requireOneOf(fibre, 'fibre', FIBRES);
    requireInRange(share, `blend.${fibre}`, 0.1, 100);
    out[fibre] = share;
    total += share;
  }
  if (Math.abs(total - 100) > 1e-9) {
    throw new RangeError(`blend totals ${total} percent, it must total 100`);
  }
  return out;
}

/** The share of the roll that a dye class can actually reach. */
export function dyeableShare(blend, fibres) {
  const normalised = normaliseBlend(blend);
  return fibres.reduce((sum, fibre) => sum + (normalised[fibre] ?? 0), 0) / 100;
}

export function makeRoll(input) {
  const id = requireText(input.id, 'roll.id', { maxLength: 24 });
  const quality = requireText(input.quality, 'roll.quality', { maxLength: 60 });
  const construction = requireOneOf(input.construction, 'roll.construction', CONSTRUCTIONS);
  const blend = normaliseBlend(input.blend);
  const length = requirePositive(input.length, 'roll.length');
  const lengthUnit = optional(input.lengthUnit, (v) => requireText(v, 'roll.lengthUnit'), 'm');
  const widthCm = requirePositive(input.widthCm, 'roll.widthCm');
  const gsm = requirePositive(input.gsm, 'roll.gsm');
  const nominalMass = rollDryMass({ length, lengthUnit, widthCm, gsm });
  const weighedMass = optional(
    input.weighedMass,
    (v) => requirePositive(v, 'roll.weighedMass'),
    null
  );
  const faults = optional(input.faults, (v) => requireNonNegative(v, 'roll.faults'), 0);

  return Object.freeze({
    id,
    quality,
    construction,
    blend,
    length,
    lengthUnit,
    widthCm,
    gsm,
    nominalMass,
    weighedMass,
    faults,
    mass: weighedMass ?? nominalMass,
  });
}

/**
 * How far the weighed mass sits from what the docket implies, as a signed
 * fraction. Goods inwards flags anything past a couple of percent because it
 * usually means the width or the gsm on the docket is wrong.
 */
export function massVariance(roll) {
  if (roll.weighedMass === null) return null;
  return (roll.weighedMass - roll.nominalMass) / roll.nominalMass;
}

export function isSuspect(roll, { limit = 0.03 } = {}) {
  const variance = massVariance(roll);
  return variance !== null && Math.abs(variance) > limit;
}

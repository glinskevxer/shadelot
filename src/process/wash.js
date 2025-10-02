/**
 * Washing off.
 *
 * After a reactive dyeing the cloth carries hydrolysed dye that is not bonded
 * to anything and will come off on the first wash the customer gives it. Getting
 * it off in the works is a sequence of baths, and the question is always how
 * many: each one costs water and heat and each one removes less than the last.
 *
 * The model is a dilution series. Each bath removes a fixed share of what is
 * left, so the residue falls geometrically and the marginal bath stops being
 * worth its water long before the residue reaches zero.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requirePositive,
  optional,
} from '../valid/guards.js';

export const BATH_KINDS = Object.freeze(['cold-rinse', 'warm-rinse', 'soap', 'neutralise']);

/** Share of the loose dye each kind of bath takes off, measured on this floor. */
export const EFFICIENCY = Object.freeze({
  'cold-rinse': 0.35,
  'warm-rinse': 0.5,
  soap: 0.72,
  neutralise: 0.2,
});

export function efficiencyOf(kind) {
  const value = EFFICIENCY[kind];
  if (value === undefined) {
    throw new FieldError('kind', `must be one of ${BATH_KINDS.join(', ')}`, kind);
  }
  return value;
}

/**
 * Walk a sequence of baths and say what is left after each one. The starting
 * residue is the unfixed dye as a fraction of the dye charged.
 */
export function washOff(baths, { startingResidue = 0.25 } = {}) {
  requireArray(baths, 'baths', { min: 1 });
  requireInRange(startingResidue, 'startingResidue', 0, 1);
  let residue = startingResidue;
  return baths.map((kind, index) => {
    const removed = residue * efficiencyOf(kind);
    residue -= removed;
    return { step: index + 1, kind, removed, residue };
  });
}

export function residueAfter(baths, options) {
  const steps = washOff(baths, options);
  return steps.at(-1).residue;
}

/**
 * The shortest sequence that gets the residue under a target. Baths are chosen
 * from the kinds allowed, cheapest first, and a soap is only taken when a rinse
 * cannot get there.
 */
export function planWashOff(
  target,
  { startingResidue = 0.25, allow = BATH_KINDS, maxBaths = 8 } = {}
) {
  requireInRange(target, 'target', 0.0001, 1);
  requireInRange(startingResidue, 'startingResidue', 0, 1);
  requirePositive(maxBaths, 'maxBaths');
  const usable = allow.filter((kind) => kind !== 'neutralise');
  if (usable.length === 0) {
    throw new FieldError('allow', 'names no bath that removes anything worth counting', allow);
  }
  const order = [...usable].sort((a, b) => efficiencyOf(a) - efficiencyOf(b));
  const baths = [];
  let residue = startingResidue;
  while (residue > target && baths.length < maxBaths) {
    const kind =
      order.find((candidate) => residue * (1 - efficiencyOf(candidate)) <= target) ?? order.at(-1);
    residue *= 1 - efficiencyOf(kind);
    baths.push(kind);
  }
  return { baths, residue, reached: residue <= target };
}

/**
 * Whether one more bath is worth its water. The marginal bath removes a share
 * of what is left, and once that is smaller than what the works has decided is
 * worth a bath of water, it stops.
 */
export function worthAnotherBath(residue, kind, { worthwhile = 0.005 } = {}) {
  requireInRange(residue, 'residue', 0, 1);
  requirePositive(worthwhile, 'worthwhile');
  return residue * efficiencyOf(kind) >= worthwhile;
}

/** Water for a wash off sequence, in bath volumes. */
export function bathVolumes(baths) {
  return requireArray(baths, 'baths').length;
}

/** The staining risk a residue leaves, in the words a customer complaint uses. */
export function stainingRisk(residue, { limit = 0.02 } = {}) {
  requireInRange(residue, 'residue', 0, 1);
  const ratio = residue / optional(limit, Number, 0.02);
  if (ratio <= 0.5) return 'clear';
  if (ratio <= 1) return 'acceptable';
  if (ratio <= 2) return 'marginal';
  return 'will stain';
}

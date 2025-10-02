/**
 * Forming a greige lot.
 *
 * A dye lot is the unit of shade continuity. Everything inside it goes into one
 * machine load and comes out one colour, so the rule that decides what may sit
 * together is the most consequential rule in the building. Two rolls of the
 * same nominal quality from different weaving beams take dye differently, and
 * that difference shows up as barre nobody can correct afterwards.
 */

import {
  requireArray,
  requireText,
  requirePositive,
  optional,
  FieldError,
} from '../valid/guards.js';

/** The fields that must agree across a lot before anything else is considered. */
export const BINDING_FIELDS = Object.freeze(['quality', 'construction', 'widthCm']);

function blendKey(blend) {
  return Object.keys(blend)
    .sort()
    .map((fibre) => `${fibre}:${blend[fibre]}`)
    .join('|');
}

/**
 * The compatibility key. Two rolls may share a lot when their keys match.
 * Beam is included when the caller has it, because it is the single best
 * predictor of a shade difference within one quality.
 */
export function compatibilityKey(roll, { separateBeams = true } = {}) {
  const parts = BINDING_FIELDS.map((field) => `${field}=${roll[field]}`);
  parts.push(`blend=${blendKey(roll.blend)}`);
  if (separateBeams && roll.beam) {
    parts.push(`beam=${roll.beam}`);
  }
  return parts.join(';');
}

export function canShareLot(a, b, options) {
  return compatibilityKey(a, options) === compatibilityKey(b, options);
}

/**
 * Split a pile of received rolls into the lots they are allowed to form. Rolls
 * come back in the order they were given so a printed pick list matches the
 * order of the racks.
 */
export function groupIntoLots(rolls, options = {}) {
  requireArray(rolls, 'rolls', { min: 1 });
  const groups = new Map();
  for (const roll of rolls) {
    const key = compatibilityKey(roll, options);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(roll);
  }
  return [...groups.entries()].map(([key, members]) => ({ key, rolls: members }));
}

export function makeLot(input) {
  const id = requireText(input.id, 'lot.id', { maxLength: 24 });
  const customer = requireText(input.customer, 'lot.customer', { maxLength: 80 });
  const rolls = requireArray(input.rolls, 'lot.rolls', { min: 1 });
  const options = { separateBeams: optional(input.separateBeams, Boolean, true) };
  const first = rolls[0];
  for (const roll of rolls.slice(1)) {
    if (!canShareLot(first, roll, options)) {
      throw new FieldError('lot.rolls', `holds roll ${roll.id} which cannot share a lot`, roll.id);
    }
  }
  const mass = rolls.reduce((sum, roll) => sum + roll.mass, 0);
  const length = rolls.reduce((sum, roll) => sum + roll.length, 0);
  return Object.freeze({
    id,
    customer,
    rolls: Object.freeze([...rolls]),
    quality: first.quality,
    construction: first.construction,
    blend: first.blend,
    widthCm: first.widthCm,
    mass,
    length,
    rollCount: rolls.length,
    key: compatibilityKey(first, options),
  });
}

/**
 * Whether a lot fits a machine. A load below the minimum runs at a liquor ratio
 * the machine was never designed for and the shade comes out light.
 */
export function fitsMachine(lot, machine) {
  requirePositive(machine.minLoadKg, 'machine.minLoadKg');
  requirePositive(machine.maxLoadKg, 'machine.maxLoadKg');
  return lot.mass >= machine.minLoadKg && lot.mass <= machine.maxLoadKg;
}

/**
 * Despatch.
 *
 * Cloth leaves in bales, and how it is baled is a customer instruction rather
 * than a works preference: some want one shade per bale, some want a fixed
 * metreage per bale for their cutting room, and some want the rolls kept in the
 * order they came off the machine so the shade walks smoothly across the lay.
 *
 * Getting it wrong is expensive in a way nothing else here is, because the cloth
 * is on a lorry before anybody notices.
 */

import {
  FieldError,
  requireArray,
  requireInteger,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const RULES = ['one-shade-per-bale', 'fixed-metres', 'machine-order', 'fill-to-weight'];

export function makeInstruction(input) {
  const rule = requireOneOf(input.rule, 'instruction.rule', RULES);
  const instruction = {
    rule,
    customer: requireText(input.customer, 'instruction.customer', { maxLength: 80 }),
  };
  if (rule === 'fixed-metres') {
    instruction.metresPerBale = requirePositive(input.metresPerBale, 'instruction.metresPerBale');
  }
  if (rule === 'fill-to-weight') {
    instruction.kgPerBale = requirePositive(input.kgPerBale, 'instruction.kgPerBale');
  }
  instruction.maxRollsPerBale = optional(
    input.maxRollsPerBale,
    (v) => requireInteger(v, 'instruction.maxRollsPerBale'),
    8
  );
  return Object.freeze(instruction);
}

function newBale(number) {
  return { number, rolls: [], metres: 0, kg: 0, shades: new Set() };
}

function seal(bale) {
  return {
    number: bale.number,
    rolls: bale.rolls.map((roll) => roll.id),
    rollCount: bale.rolls.length,
    metres: bale.metres,
    kg: bale.kg,
    shades: [...bale.shades].sort(),
  };
}

/**
 * Pack a set of rolls into bales. Rolls are taken in the order given, which is
 * what the machine order rule depends on and what the others are indifferent to.
 */
export function pack(rolls, instruction) {
  requireArray(rolls, 'rolls', { min: 1 });
  const bales = [];
  let current = newBale(1);
  const close = () => {
    if (current.rolls.length > 0) {
      bales.push(seal(current));
      current = newBale(bales.length + 1);
    }
  };

  for (const roll of rolls) {
    const metres = requirePositive(roll.metres, 'roll.metres');
    const kg = requirePositive(roll.kg, 'roll.kg');
    const shade = requireText(roll.shade ?? 'unstated', 'roll.shade', { maxLength: 60 });

    if (
      instruction.rule === 'one-shade-per-bale' &&
      current.shades.size > 0 &&
      !current.shades.has(shade)
    ) {
      close();
    }
    if (
      instruction.rule === 'fixed-metres' &&
      current.metres + metres > instruction.metresPerBale
    ) {
      close();
    }
    if (instruction.rule === 'fill-to-weight' && current.kg + kg > instruction.kgPerBale) {
      close();
    }
    if (current.rolls.length >= instruction.maxRollsPerBale) {
      close();
    }

    current.rolls.push(roll);
    current.metres += metres;
    current.kg += kg;
    current.shades.add(shade);
  }
  close();
  return bales;
}

/** Whether a packing meets the instruction it was made for. */
export function checkPacking(bales, instruction) {
  const problems = [];
  for (const bale of bales) {
    if (bale.rollCount > instruction.maxRollsPerBale) {
      problems.push(`bale ${bale.number} holds ${bale.rollCount} rolls`);
    }
    if (instruction.rule === 'one-shade-per-bale' && bale.shades.length > 1) {
      problems.push(`bale ${bale.number} mixes ${bale.shades.join(' and ')}`);
    }
    if (instruction.rule === 'fixed-metres' && bale.metres > instruction.metresPerBale) {
      problems.push(`bale ${bale.number} carries ${bale.metres} metres`);
    }
    if (instruction.rule === 'fill-to-weight' && bale.kg > instruction.kgPerBale) {
      problems.push(`bale ${bale.number} weighs ${bale.kg} kg`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** The note that goes with the lorry. */
export function packingNote(bales, { order, at }) {
  requireText(order, 'order', { maxLength: 24 });
  if (bales.length === 0) {
    throw new FieldError('bales', 'is empty, there is nothing to despatch', bales);
  }
  return {
    order,
    at: optional(at, (v) => requireText(v, 'at'), null),
    bales: bales.length,
    rolls: bales.reduce((sum, bale) => sum + bale.rollCount, 0),
    metres: bales.reduce((sum, bale) => sum + bale.metres, 0),
    kg: bales.reduce((sum, bale) => sum + bale.kg, 0),
    shades: [...new Set(bales.flatMap((bale) => bale.shades))].sort(),
  };
}

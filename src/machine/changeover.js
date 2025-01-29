/**
 * Cleaning a machine between shades.
 *
 * A changeover is not one operation. It is a recipe like any other, with
 * chemicals and a temperature and a time, and it costs water and heat that
 * nobody puts on a batch card because it belongs to no batch. Putting it here
 * means the sequence planner and the utility account are reading the same
 * numbers rather than two guesses.
 */

import {
  FieldError,
  requireArray,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';
import { CLEAN_MINUTES } from '../schedule/sequence.js';

/** The works cleaning recipes, one per cleaning kind the sequencer names. */
export const RECIPES = Object.freeze({
  none: { baths: 0, temperature: 20, chemicals: [] },
  rinse: { baths: 1, temperature: 40, chemicals: [] },
  boil: { baths: 2, temperature: 95, chemicals: [{ role: 'soaping', gpl: 1.5 }] },
  strip: {
    baths: 3,
    temperature: 95,
    chemicals: [
      { role: 'reducing', gpl: 4 },
      { role: 'alkali', gpl: 3 },
      { role: 'soaping', gpl: 2 },
    ],
  },
});

export function recipeFor(clean) {
  const recipe = RECIPES[clean];
  if (!recipe) {
    throw new FieldError('clean', `must be one of ${Object.keys(RECIPES).join(', ')}`, clean);
  }
  return recipe;
}

/**
 * What one changeover costs on a given machine. The bath is the machine's own
 * empty volume plus nothing, because a cleaning bath runs with no cloth in it.
 */
export function changeoverCost(clean, machine, { ambient = 20 } = {}) {
  const recipe = recipeFor(clean);
  requirePositive(machine.deadVolumeLitres, 'machine.deadVolumeLitres');
  const litres = machine.deadVolumeLitres * recipe.baths;
  const rise = Math.max(0, recipe.temperature - ambient);
  return {
    clean,
    baths: recipe.baths,
    litres,
    minutes: CLEAN_MINUTES[clean],
    heatKj: litres * 4.186 * rise,
    chemicals: recipe.chemicals.map((chemical) => ({
      role: chemical.role,
      gpl: chemical.gpl,
      kg: (machine.deadVolumeLitres * chemical.gpl) / 1000,
    })),
  };
}

/** Which article in the works store fills each role a cleaning recipe names. */
export function resolveChemicals(cost, store) {
  return cost.chemicals.map((line) => {
    const candidates = [...store.values()].filter((chemical) => chemical.role === line.role);
    if (candidates.length === 0) {
      throw new FieldError('role', `the works stocks nothing for the ${line.role} step`, line.role);
    }
    const cheapest = candidates.reduce((best, chemical) =>
      chemical.pricePerKg < best.pricePerKg ? chemical : best
    );
    return {
      ...line,
      code: cheapest.code,
      name: cheapest.name,
      cost: line.kg * cheapest.pricePerKg,
    };
  });
}

/** The cleaning bill for a whole day, from the sequence the planner produced. */
export function dayCleaningCost(steps, machine, options = {}) {
  requireArray(steps, 'steps');
  const rows = steps.map((step) => changeoverCost(step.clean, machine, options));
  return {
    changeovers: rows.length,
    litres: rows.reduce((sum, row) => sum + row.litres, 0),
    minutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    heatKj: rows.reduce((sum, row) => sum + row.heatKj, 0),
    rows,
  };
}

/**
 * Whether a cleaning is worth skipping. Sometimes it is: two batches of the same
 * customer and the same family, where a trace of the last one does no harm.
 */
export function canSkip(clean, { sameFamily = false, sameCustomer = false } = {}) {
  requireText(clean, 'clean', { maxLength: 20 });
  recipeFor(clean);
  if (clean === 'none') return { skip: true, reason: 'there is nothing to skip' };
  if (clean === 'rinse' && sameFamily) {
    return { skip: true, reason: 'the same shade family, a trace of the last one does no harm' };
  }
  if (clean === 'boil' && sameFamily && sameCustomer) {
    return { skip: true, reason: 'one customer and one family, the risk is theirs and known' };
  }
  return { skip: false, reason: `a ${clean} cannot be skipped between these two` };
}

export function cleaningKinds() {
  return Object.keys(RECIPES);
}

export function totalChemicalCost(cost, store) {
  return resolveChemicals(cost, store).reduce(
    (sum, line) => sum + optional(line.cost, Number, 0),
    0
  );
}

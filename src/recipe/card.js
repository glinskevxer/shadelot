/**
 * The dispensing card.
 *
 * This is where the recipe stops being a percentage and becomes a weight
 * somebody carries to a machine. Two things happen and they happen in this
 * order: the recipe is scaled onto the load, and then every line is rounded to
 * a balance that exists. Rounding before scaling would round the percentage,
 * which is meaningless, and it is the mistake the old spreadsheet made.
 */

import { requirePositive, optional } from '../valid/guards.js';
import { dispensable } from '../measure/rounding.js';
import { chemicalCharge, findChemical } from '../chemical/catalogue.js';
import { find } from '../dyestuff/catalogue.js';
import { depthProfile } from './depth.js';

/** Bath volume for a load, straight off the liquor ratio. */
export function liquorVolume(fibreKg, liquorRatio) {
  requirePositive(fibreKg, 'fibreKg');
  requirePositive(liquorRatio, 'liquorRatio');
  return fibreKg * liquorRatio;
}

function dyeLines(recipe, fibreKg, catalogue, tolerance) {
  return recipe.dyes.map((dye) => {
    const article = find(catalogue, dye.code);
    const exact = (fibreKg * dye.owf) / 100;
    const rounded = dispensable(exact, { tolerance });
    return {
      kind: 'dye',
      code: dye.code,
      name: article.name,
      basis: 'owf',
      dose: dye.owf,
      exactKg: exact,
      kg: rounded.amount,
      balance: rounded.balance,
      unitPrice: article.pricePerKg,
    };
  });
}

function auxiliaryLines(recipe, fibreKg, litres, chemicals, tolerance) {
  return recipe.auxiliaries.map((auxiliary) => {
    const chemical = findChemical(chemicals, auxiliary.code);
    const exact = chemicalCharge(chemical, auxiliary.dose, { fibreKg, liquorLitres: litres });
    const rounded = dispensable(exact, { tolerance });
    return {
      kind: 'auxiliary',
      code: chemical.code,
      name: chemical.name,
      basis: chemical.basis,
      dose: auxiliary.dose,
      exactKg: exact,
      kg: rounded.amount,
      balance: rounded.balance,
      unitPrice: chemical.pricePerKg,
    };
  });
}

function electrolyteLines(recipe, litres, chemicals, options) {
  const { saltCode, alkaliCode, tolerance } = options;
  const profile = depthProfile(recipe.totalOwf, recipe.liquorRatio);
  const lines = [];
  for (const [code, gpl, role] of [
    [saltCode, profile.saltGpl, 'salt'],
    [alkaliCode, profile.alkaliGpl, 'alkali'],
  ]) {
    if (!code) continue;
    const chemical = findChemical(chemicals, code);
    const exact = (litres * gpl) / 1000;
    const rounded = dispensable(exact, { tolerance });
    lines.push({
      kind: 'electrolyte',
      role,
      code: chemical.code,
      name: chemical.name,
      basis: 'gpl',
      dose: gpl,
      exactKg: exact,
      kg: rounded.amount,
      balance: rounded.balance,
      unitPrice: chemical.pricePerKg,
    });
  }
  return lines;
}

export function buildCard(recipe, fibreKg, context) {
  const { catalogue, chemicals } = context;
  requirePositive(fibreKg, 'fibreKg');
  const tolerance = optional(context.tolerance, (v) => requirePositive(v, 'tolerance'), 0.02);
  const litres = liquorVolume(fibreKg, recipe.liquorRatio);
  const lines = [
    ...dyeLines(recipe, fibreKg, catalogue, tolerance),
    ...electrolyteLines(recipe, litres, chemicals, { ...context, tolerance }),
    ...auxiliaryLines(recipe, fibreKg, litres, chemicals, tolerance),
  ];
  return {
    recipeId: recipe.id,
    fibreKg,
    litres,
    band: recipe.band,
    lines,
    dyeKg: lines.filter((l) => l.kind === 'dye').reduce((sum, l) => sum + l.kg, 0),
    totalKg: lines.reduce((sum, l) => sum + l.kg, 0),
  };
}

/** How far the rounded card sits from the exact recipe, as a fraction of each line. */
export function roundingDrift(card) {
  return card.lines
    .filter((line) => line.exactKg > 0)
    .map((line) => ({
      code: line.code,
      drift: (line.kg - line.exactKg) / line.exactKg,
    }));
}

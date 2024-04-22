/**
 * A recipe.
 *
 * A recipe is written against a fibre, not against a load. It names dyes as a
 * percentage on the weight of that fibre and auxiliaries on whichever basis
 * their entry in the chemical store carries. Nothing here knows how big the
 * batch is; that is the whole point of keeping it separate from the card.
 */

import {
  FieldError,
  requireArray,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';
import { find } from '../dyestuff/catalogue.js';
import { findChemical } from '../chemical/catalogue.js';
import { depthBand } from './depth.js';

export const PROCESSES = ['exhaust', 'pad-batch', 'pad-steam', 'jig', 'package'];

function normaliseDyes(input, catalogue) {
  const dyes = requireArray(input, 'recipe.dyes', { min: 1 });
  const seen = new Set();
  return dyes.map((entry) => {
    const code = requireText(entry.code, 'recipe.dyes[].code', { maxLength: 32 });
    if (seen.has(code)) {
      throw new FieldError('recipe.dyes[].code', 'appears twice in one recipe', code);
    }
    seen.add(code);
    const owf = requirePositive(entry.owf, `recipe.dyes[${code}].owf`);
    const dyestuff = find(catalogue, code);
    if (owf > dyestuff.maxOwf) {
      throw new FieldError(
        `recipe.dyes[${code}].owf`,
        `exceeds the ${dyestuff.maxOwf} percent ceiling for this article`,
        owf
      );
    }
    return Object.freeze({ code, owf, dyeClass: dyestuff.dyeClass });
  });
}

function normaliseAuxiliaries(input, store) {
  const auxiliaries = optional(input, (v) => requireArray(v, 'recipe.auxiliaries'), []);
  const seen = new Set();
  return auxiliaries.map((entry) => {
    const code = requireText(entry.code, 'recipe.auxiliaries[].code', { maxLength: 32 });
    if (seen.has(code)) {
      throw new FieldError('recipe.auxiliaries[].code', 'appears twice in one recipe', code);
    }
    seen.add(code);
    const chemical = findChemical(store, code);
    const dose = requirePositive(entry.dose, `recipe.auxiliaries[${code}].dose`);
    return Object.freeze({ code, dose, basis: chemical.basis, role: chemical.role });
  });
}

export function makeRecipe(input, { catalogue, chemicals }) {
  const id = requireText(input.id, 'recipe.id', { maxLength: 24 });
  const name = requireText(input.name, 'recipe.name', { maxLength: 80 });
  const process = requireOneOf(input.process, 'recipe.process', PROCESSES);
  const substrate = requireText(input.substrate, 'recipe.substrate', { maxLength: 40 });
  const liquorRatio = requirePositive(input.liquorRatio, 'recipe.liquorRatio');
  const dyes = normaliseDyes(input.dyes, catalogue);
  const auxiliaries = normaliseAuxiliaries(input.auxiliaries, chemicals);

  const classes = new Set(dyes.map((dye) => dye.dyeClass));
  if (classes.size > 1) {
    throw new FieldError(
      'recipe.dyes',
      `mixes the classes ${[...classes].sort().join(' and ')}, which need different baths`,
      [...classes]
    );
  }

  const totalOwf = dyes.reduce((sum, dye) => sum + dye.owf, 0);

  return Object.freeze({
    id,
    name,
    process,
    substrate,
    liquorRatio,
    dyes: Object.freeze(dyes),
    auxiliaries: Object.freeze(auxiliaries),
    dyeClass: dyes[0].dyeClass,
    totalOwf,
    band: depthBand(totalOwf).name,
  });
}

/** The share each dye contributes to the total, which is what a shade note quotes. */
export function dyeShares(recipe) {
  return recipe.dyes.map((dye) => ({ code: dye.code, share: dye.owf / recipe.totalOwf }));
}

export function hasRole(recipe, role) {
  return recipe.auxiliaries.some((auxiliary) => auxiliary.role === role);
}

/** Recipes that differ only in depth share a shade family and can be lab matched together. */
export function shadeFamily(recipe) {
  return dyeShares(recipe)
    .map(({ code, share }) => `${code}:${share.toFixed(4)}`)
    .sort()
    .join('|');
}

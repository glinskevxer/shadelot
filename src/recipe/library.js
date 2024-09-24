/**
 * The recipe library.
 *
 * Nothing here is a database. It is a search over the recipes the works has
 * already run, and the reason it exists is that matching a shade from a
 * neighbouring recipe takes one lab dip and matching it from nothing takes
 * four.
 *
 * The distance between two recipes is a distance between their dye ratios, not
 * between their depths. A recipe at half the depth of another in the same
 * proportions is the same shade, lighter, and it is the best possible starting
 * point.
 */

import { requireArray, requireInRange, requirePositive, optional } from '../valid/guards.js';
import { dyeShares } from './recipe.js';

/**
 * Distance between two recipes as the sum of absolute differences in their dye
 * shares. Zero means the same proportions, whatever the depths. Two is the
 * furthest apart two recipes with no dye in common can be.
 */
export function ratioDistance(a, b) {
  const shares = new Map();
  for (const { code, share } of dyeShares(a)) {
    shares.set(code, share);
  }
  for (const { code, share } of dyeShares(b)) {
    shares.set(code, (shares.get(code) ?? 0) - share);
  }
  return [...shares.values()].reduce((sum, value) => sum + Math.abs(value), 0);
}

/** How far apart two recipes are in depth, as a ratio of the lighter one. */
export function depthRatio(a, b) {
  const low = Math.min(a.totalOwf, b.totalOwf);
  const high = Math.max(a.totalOwf, b.totalOwf);
  requirePositive(low, 'totalOwf');
  return high / low;
}

export function createLibrary(recipes = []) {
  return requireArray(recipes, 'recipes').map((recipe) => ({
    recipe,
    runs: 0,
    rightFirstTime: null,
  }));
}

export function record(library, recipeId, { accepted }) {
  const entry = library.find((row) => row.recipe.id === recipeId);
  if (!entry) return null;
  const previousGood = (entry.rightFirstTime ?? 0) * entry.runs;
  entry.runs += 1;
  entry.rightFirstTime = (previousGood + (accepted ? 1 : 0)) / entry.runs;
  return entry;
}

/**
 * Find the recipes closest to a target. Ordered by ratio distance first, then
 * by how far the depth has to move, then by how well the recipe has run.
 */
export function nearest(library, target, { limit = 5, maxDistance = 0.6, sameClass = true } = {}) {
  requirePositive(limit, 'limit');
  requireInRange(maxDistance, 'maxDistance', 0, 2);
  return library
    .filter((entry) => entry.recipe.id !== target.id)
    .filter((entry) => !sameClass || entry.recipe.dyeClass === target.dyeClass)
    .map((entry) => ({
      id: entry.recipe.id,
      name: entry.recipe.name,
      distance: ratioDistance(target, entry.recipe),
      depthRatio: depthRatio(target, entry.recipe),
      runs: entry.runs,
      rightFirstTime: entry.rightFirstTime,
    }))
    .filter((row) => row.distance <= maxDistance)
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        Math.abs(Math.log(a.depthRatio)) - Math.abs(Math.log(b.depthRatio)) ||
        (b.rightFirstTime ?? 0) - (a.rightFirstTime ?? 0)
    )
    .slice(0, limit);
}

/**
 * Scale a recipe to a wanted depth, keeping every ratio. This is what the lab
 * does with a neighbour before it dips it, and it is exact rather than a guess.
 */
export function scaleToDepth(recipe, totalOwf) {
  requirePositive(totalOwf, 'totalOwf');
  const factor = totalOwf / recipe.totalOwf;
  return {
    ...recipe,
    totalOwf,
    dyes: recipe.dyes.map((dye) => ({ ...dye, owf: dye.owf * factor })),
  };
}

/** The library entries that have never run, which is the backlog the lab owns. */
export function unproven(library) {
  return library.filter((entry) => entry.runs === 0).map((entry) => entry.recipe.id);
}

export function bestPerforming(library, { minimumRuns = 3 } = {}) {
  return library
    .filter((entry) => entry.runs >= optional(minimumRuns, Number, 3))
    .sort((a, b) => (b.rightFirstTime ?? 0) - (a.rightFirstTime ?? 0))
    .map((entry) => ({
      id: entry.recipe.id,
      runs: entry.runs,
      rightFirstTime: entry.rightFirstTime,
    }));
}

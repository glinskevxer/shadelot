/**
 * Depth of shade.
 *
 * The salt and alkali a reactive dyeing needs are set by how much dye is in the
 * bath, not by the recipe author. The bands below are the works standard and
 * they are read as a step function: a shade sitting on a boundary takes the
 * lower band, because overshooting the salt on a pale shade is how you get
 * unlevel dyeing that nothing later can fix.
 */

import { FieldError, requireNonNegative, requirePositive } from '../valid/guards.js';

export const DEPTH_BANDS = Object.freeze([
  { name: 'pale', upTo: 0.5, saltGpl: 20, alkaliGpl: 5 },
  { name: 'light', upTo: 1, saltGpl: 30, alkaliGpl: 8 },
  { name: 'medium', upTo: 2, saltGpl: 50, alkaliGpl: 12 },
  { name: 'dark', upTo: 4, saltGpl: 70, alkaliGpl: 18 },
  { name: 'heavy', upTo: Infinity, saltGpl: 90, alkaliGpl: 22 },
]);

export function bandNames() {
  return DEPTH_BANDS.map((band) => band.name);
}

/** The band a total dye percentage falls in. */
export function depthBand(totalOwf) {
  requireNonNegative(totalOwf, 'totalOwf');
  const band = DEPTH_BANDS.find((candidate) => totalOwf <= candidate.upTo);
  return band ?? DEPTH_BANDS.at(-1);
}

export function bandByName(name) {
  const band = DEPTH_BANDS.find((candidate) => candidate.name === name);
  if (!band) {
    throw new FieldError('band', `must be one of ${bandNames().join(', ')}`, name);
  }
  return band;
}

/**
 * The electrolyte the band calls for. Liquor ratio moves it: a long bath needs
 * more salt at the same grams per litre to reach the same salt on the fibre, so
 * the works standard is written against a reference ratio and scaled from there.
 */
export const REFERENCE_LIQUOR_RATIO = 8;

export function saltForDepth(totalOwf, liquorRatio, { reference = REFERENCE_LIQUOR_RATIO } = {}) {
  requirePositive(liquorRatio, 'liquorRatio');
  requirePositive(reference, 'reference');
  const band = depthBand(totalOwf);
  return (band.saltGpl * reference) / liquorRatio;
}

export function alkaliForDepth(totalOwf, liquorRatio, { reference = REFERENCE_LIQUOR_RATIO } = {}) {
  requirePositive(liquorRatio, 'liquorRatio');
  requirePositive(reference, 'reference');
  const band = depthBand(totalOwf);
  return (band.alkaliGpl * reference) / liquorRatio;
}

/** Everything the depth decides, in one call, for a recipe card to print. */
export function depthProfile(totalOwf, liquorRatio, options = {}) {
  const band = depthBand(totalOwf);
  return {
    band: band.name,
    totalOwf,
    liquorRatio,
    saltGpl: saltForDepth(totalOwf, liquorRatio, options),
    alkaliGpl: alkaliForDepth(totalOwf, liquorRatio, options),
  };
}

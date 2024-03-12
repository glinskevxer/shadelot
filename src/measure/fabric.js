/**
 * Fabric geometry.
 *
 * A roll arrives with a length, a width and a construction weight. Everything
 * the dyehouse charges for and everything it doses against is derived from the
 * dry mass of that roll, so the derivation lives in one module and is tested
 * against merchant arithmetic rather than against itself.
 */

import { convertLength, convertMass, toMetres } from './units.js';

const SQUARE_METRES_PER_SQUARE_YARD = 0.83612736;

function positive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, received ${String(value)}`);
  }
  return value;
}

/** Area of a roll in square metres, given length and width in metres. */
export function rollArea(lengthMetres, widthMetres) {
  positive(lengthMetres, 'length');
  positive(widthMetres, 'width');
  return lengthMetres * widthMetres;
}

/** Dry mass of a roll from its area and its areal density in grams per square metre. */
export function rollMass(areaSquareMetres, gramsPerSquareMetre) {
  positive(areaSquareMetres, 'area');
  positive(gramsPerSquareMetre, 'gsm');
  return (areaSquareMetres * gramsPerSquareMetre) / 1000;
}

/** Grams per square metre from ounces per square yard, the American way of quoting it. */
export function gsmFromOuncesPerSquareYard(ouncesPerSquareYard) {
  positive(ouncesPerSquareYard, 'oz/yd2');
  const grams = convertMass(ouncesPerSquareYard, 'oz', 'g');
  return grams / SQUARE_METRES_PER_SQUARE_YARD;
}

/** The reverse, for a customer who reads a spec sheet in ounces. */
export function ouncesPerSquareYardFromGsm(gramsPerSquareMetre) {
  positive(gramsPerSquareMetre, 'gsm');
  const ounces = convertMass(gramsPerSquareMetre, 'g', 'oz');
  return ounces * SQUARE_METRES_PER_SQUARE_YARD;
}

/**
 * Linear density in grams per linear metre. Knitters quote this instead of gsm
 * because a tubular knit has no meaningful flat width until it is slit.
 */
export function gramsPerLinearMetre(gramsPerSquareMetre, widthMetres) {
  positive(gramsPerSquareMetre, 'gsm');
  positive(widthMetres, 'width');
  return gramsPerSquareMetre * widthMetres;
}

/**
 * Dry mass of a roll described the way a docket describes it.
 *
 * Accepts the length in any length unit the unit table carries and the width in
 * centimetres, because that is how a cuttable width is written down.
 */
export function rollDryMass({ length, lengthUnit = 'm', widthCm, gsm }) {
  const metres = toMetres(positive(length, 'length'), lengthUnit);
  const widthMetres = convertLength(positive(widthCm, 'width'), 'cm', 'm');
  return rollMass(rollArea(metres, widthMetres), positive(gsm, 'gsm'));
}

/** Total dry mass of a list of rolls, in kilograms. */
export function lotDryMass(rolls) {
  if (!Array.isArray(rolls) || rolls.length === 0) {
    throw new RangeError('a lot needs at least one roll');
  }
  return rolls.reduce((sum, roll) => sum + rollDryMass(roll), 0);
}

export const geometry = Object.freeze({ SQUARE_METRES_PER_SQUARE_YARD });

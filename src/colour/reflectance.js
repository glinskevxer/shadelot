/**
 * Reflectance and colour strength.
 *
 * A spectrophotometer gives a curve, not three numbers, and the curve is what
 * tells you whether a batch is weak rather than merely off shade. Kubelka Munk
 * turns reflectance at the absorption peak into something proportional to the
 * dye on the fibre, which is the only honest basis for an add on.
 *
 * The curve here runs 400 to 700 nanometres in ten nanometre steps, which is
 * what the works instrument reports.
 */

import { FieldError, requireArray, requireInRange, requirePositive } from '../valid/guards.js';

export const FIRST_WAVELENGTH = 400;
export const WAVELENGTH_STEP = 10;
export const BAND_COUNT = 31;

export function wavelengths() {
  return Array.from({ length: BAND_COUNT }, (_, i) => FIRST_WAVELENGTH + i * WAVELENGTH_STEP);
}

export function makeCurve(values) {
  requireArray(values, 'reflectance', { min: BAND_COUNT });
  if (values.length !== BAND_COUNT) {
    throw new FieldError('reflectance', `must carry exactly ${BAND_COUNT} bands`, values.length);
  }
  const bands = values.map((value, index) =>
    requireInRange(value, `reflectance[${FIRST_WAVELENGTH + index * WAVELENGTH_STEP}]`, 0.0001, 1)
  );
  return Object.freeze(bands);
}

/** Kubelka Munk on a single reflectance value. */
export function kOverS(reflectance) {
  requireInRange(reflectance, 'reflectance', 0.0001, 1);
  return (1 - reflectance) ** 2 / (2 * reflectance);
}

export function kOverSCurve(curve) {
  return curve.map(kOverS);
}

/** The wavelength where the cloth absorbs most, which is where strength is read. */
export function absorptionPeak(curve) {
  let index = 0;
  for (let i = 1; i < curve.length; i += 1) {
    if (curve[i] < curve[index]) index = i;
  }
  return {
    wavelength: FIRST_WAVELENGTH + index * WAVELENGTH_STEP,
    index,
    reflectance: curve[index],
  };
}

/**
 * Colour strength of a batch against a standard, as a fraction. Ninety five
 * percent means the batch is five percent weak and needs an add on of about
 * that much dye, subject to everything the dyer knows that this does not.
 */
export function colourStrength(standardCurve, batchCurve, { at } = {}) {
  const peak = at === undefined ? absorptionPeak(standardCurve) : { index: bandIndex(at) };
  const standardKs = kOverS(standardCurve[peak.index]);
  const batchKs = kOverS(batchCurve[peak.index]);
  requirePositive(standardKs, 'standard k over s');
  return batchKs / standardKs;
}

/** Strength read as the mean over the whole curve, which is steadier on a dull shade. */
export function integratedStrength(standardCurve, batchCurve) {
  const standardKs = kOverSCurve(standardCurve).reduce((a, b) => a + b, 0);
  const batchKs = kOverSCurve(batchCurve).reduce((a, b) => a + b, 0);
  requirePositive(standardKs, 'standard k over s');
  return batchKs / standardKs;
}

export function bandIndex(wavelength) {
  const index = (wavelength - FIRST_WAVELENGTH) / WAVELENGTH_STEP;
  if (!Number.isInteger(index) || index < 0 || index >= BAND_COUNT) {
    throw new FieldError(
      'wavelength',
      `must be a band between 400 and 700 in steps of 10`,
      wavelength
    );
  }
  return index;
}

/** A flat curve at one reflectance, which is what a test fixture usually wants. */
export function flatCurve(reflectance) {
  return makeCurve(Array.from({ length: BAND_COUNT }, () => reflectance));
}

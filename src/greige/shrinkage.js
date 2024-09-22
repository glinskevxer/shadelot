/**
 * Shrinkage.
 *
 * Cloth comes out of a dyeing shorter and narrower than it went in, and the
 * customer ordered finished metres. So the greige booked against an order has
 * to be more than the order, and how much more depends on the quality and on
 * the process rather than on a single works figure.
 *
 * Getting this wrong in one direction leaves a short delivery and in the other
 * leaves cloth in the warehouse nobody will pay for, which is why the allowance
 * is per quality and is refitted from the works records rather than assumed.
 */

import {
  FieldError,
  requireInRange,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export function makeAllowance(input) {
  const quality = requireText(input.quality, 'allowance.quality', { maxLength: 60 });
  const lengthShrink = requireInRange(input.lengthShrink, 'allowance.lengthShrink', 0, 0.35);
  const widthShrink = requireInRange(input.widthShrink, 'allowance.widthShrink', 0, 0.35);
  const process = optional(input.process, (v) => requireText(v, 'allowance.process'), 'exhaust');
  const samples = optional(input.samples, (v) => requirePositive(v, 'allowance.samples'), 0);
  return Object.freeze({ quality, process, lengthShrink, widthShrink, samples });
}

export function createAllowanceBook(allowances = []) {
  const book = new Map();
  for (const allowance of allowances) {
    const key = `${allowance.quality}|${allowance.process}`;
    if (book.has(key)) {
      throw new FieldError('allowance', 'is recorded twice for one quality and process', key);
    }
    book.set(key, allowance);
  }
  return book;
}

export function allowanceFor(book, quality, process = 'exhaust') {
  const exact = book.get(`${quality}|${process}`);
  if (exact) return exact;
  const anyProcess = book.get(`${quality}|exhaust`);
  if (anyProcess) return anyProcess;
  throw new FieldError('quality', `has no shrinkage allowance recorded for ${process}`, quality);
}

/** Finished metres from greige metres. */
export function finishedLength(greigeMetres, allowance) {
  requirePositive(greigeMetres, 'greigeMetres');
  return greigeMetres * (1 - allowance.lengthShrink);
}

/** Greige metres needed for a finished order, rounded up to whole metres. */
export function greigeNeeded(finishedMetres, allowance, { spoilage = 0.02 } = {}) {
  requirePositive(finishedMetres, 'finishedMetres');
  requireInRange(spoilage, 'spoilage', 0, 0.5);
  const before = finishedMetres / (1 - allowance.lengthShrink);
  return Math.ceil(before / (1 - spoilage));
}

export function finishedWidth(greigeWidthCm, allowance) {
  requirePositive(greigeWidthCm, 'greigeWidthCm');
  return greigeWidthCm * (1 - allowance.widthShrink);
}

/**
 * Finished areal density. Cloth that shrinks in both directions gets heavier
 * per square metre without gaining a gram, which is what a customer weighing a
 * swatch is measuring.
 */
export function finishedGsm(greigeGsm, allowance) {
  requirePositive(greigeGsm, 'greigeGsm');
  return greigeGsm / ((1 - allowance.lengthShrink) * (1 - allowance.widthShrink));
}

/** What one greige roll becomes, in the terms the order was taken in. */
export function projectRoll(roll, allowance) {
  return {
    id: roll.id,
    greigeLength: roll.length,
    finishedLength: finishedLength(roll.length, allowance),
    greigeWidthCm: roll.widthCm,
    finishedWidthCm: finishedWidth(roll.widthCm, allowance),
    greigeGsm: roll.gsm,
    finishedGsm: finishedGsm(roll.gsm, allowance),
  };
}

/** Refit an allowance from measured pairs, which is the only honest way to set one. */
export function fitAllowance(quality, pairs, { process = 'exhaust' } = {}) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new FieldError('pairs', 'must carry at least one measured roll', pairs);
  }
  const lengthRatios = pairs.map((pair) => 1 - pair.finishedLength / pair.greigeLength);
  const widthRatios = pairs.map((pair) => 1 - pair.finishedWidthCm / pair.greigeWidthCm);
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  return makeAllowance({
    quality,
    process,
    lengthShrink: mean(lengthRatios),
    widthShrink: mean(widthRatios),
    samples: pairs.length,
  });
}

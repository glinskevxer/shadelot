/**
 * Strength and substitution.
 *
 * A dye sold at 133 percent strength is the same chromophore cut with less
 * diluent, so three quarters of the weight gives the same depth. That much is
 * arithmetic. What is not arithmetic is that the two articles rarely land on the
 * same shade even at matched depth, so a substitution is always a proposal for
 * the lab and never an instruction to the floor.
 */

import { FieldError, requireOneOf, requirePositive } from '../valid/guards.js';
import { find, sameColourIndex } from './catalogue.js';

/**
 * The dose of a replacement article that carries the same amount of colour as a
 * given dose of the original.
 */
export function equivalentDose(dose, fromStrength, toStrength) {
  requirePositive(dose, 'dose');
  requirePositive(fromStrength, 'fromStrength');
  requirePositive(toStrength, 'toStrength');
  return (dose * fromStrength) / toStrength;
}

/** The same thing expressed as a multiplier, which is what a recipe card carries. */
export function strengthFactor(fromStrength, toStrength) {
  requirePositive(fromStrength, 'fromStrength');
  requirePositive(toStrength, 'toStrength');
  return fromStrength / toStrength;
}

export const CONFIDENCE = ['direct', 'lab-check', 'unsuitable'];

/**
 * Grade a proposed substitution. The rules read in order and the first one that
 * fires decides, because a fastness shortfall is not made acceptable by a
 * matching colour index.
 */
export function gradeSubstitution(original, replacement, { fastnessFloor = {} } = {}) {
  if (original.dyeClass !== replacement.dyeClass) {
    return { confidence: 'unsuitable', reason: 'the classes differ, the fibre would not take it' };
  }
  for (const [test, floor] of Object.entries(fastnessFloor)) {
    const rating = replacement.fastness[test];
    if (rating === undefined) {
      return {
        confidence: 'unsuitable',
        reason: `${test} fastness is not published for this article`,
      };
    }
    if (rating < floor) {
      return {
        confidence: 'unsuitable',
        reason: `${test} fastness is ${rating} against a floor of ${floor}`,
      };
    }
  }
  if (!original.colourIndex || !replacement.colourIndex) {
    return {
      confidence: 'lab-check',
      reason: 'one of the two articles has no colour index recorded',
    };
  }
  if (original.colourIndex !== replacement.colourIndex) {
    return { confidence: 'lab-check', reason: 'a different chromophore, so the shade will move' };
  }
  if (original.supplier === replacement.supplier) {
    return { confidence: 'direct', reason: 'same house, same colour index' };
  }
  return {
    confidence: 'lab-check',
    reason: 'same colour index from another house, shade usually moves',
  };
}

/**
 * Propose replacements for an article, ordered by how much can be said for
 * them and then by cost at matched depth.
 */
export function proposeSubstitutes(catalogue, code, options = {}) {
  const original = find(catalogue, code);
  const rank = (confidence) => CONFIDENCE.indexOf(confidence);
  return sameColourIndex(catalogue, code)
    .map((replacement) => {
      const grade = gradeSubstitution(original, replacement, options);
      const factor = strengthFactor(original.strength, replacement.strength);
      return {
        code: replacement.code,
        supplier: replacement.supplier,
        factor,
        costRatio: (replacement.pricePerKg * factor) / original.pricePerKg,
        ...grade,
      };
    })
    .filter((row) => row.confidence !== 'unsuitable' || options.includeUnsuitable)
    .sort((a, b) => rank(a.confidence) - rank(b.confidence) || a.costRatio - b.costRatio);
}

export function requireConfidence(value) {
  return requireOneOf(value, 'confidence', CONFIDENCE);
}

/** The ceiling on a dose, expressed on the fibre rather than on the article. */
export function ceilingOwf(dyestuff, dyeableShare) {
  requirePositive(dyeableShare, 'dyeableShare');
  if (dyeableShare > 1) {
    throw new FieldError('dyeableShare', 'is a fraction, not a percentage', dyeableShare);
  }
  return dyestuff.maxOwf * dyeableShare;
}

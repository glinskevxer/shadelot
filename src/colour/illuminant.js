/**
 * Illuminants and metamerism.
 *
 * A pair that matches under the store lighting and parts company in daylight is
 * a metameric pair, and it is the single most expensive kind of near miss this
 * trade produces: it passes the shade room, ships, and comes back.
 *
 * The lab reads each sample under three illuminants. Nothing here computes a
 * tristimulus from a spectrum; the instrument does that and reports three Lab
 * readings. What is here is the arithmetic on those readings.
 */

import { FieldError, requireOneOf, requirePositive } from '../valid/guards.js';
import { deltaE, formulaNames } from './deltae.js';

export const ILLUMINANTS = Object.freeze(['D65', 'TL84', 'A']);

export const ILLUMINANT_NAMES = Object.freeze({
  D65: 'average north daylight',
  TL84: 'shop fluorescent',
  A: 'tungsten',
});

export function describeIlluminant(name) {
  const description = ILLUMINANT_NAMES[requireOneOf(name, 'illuminant', ILLUMINANTS)];
  return `${name}, ${description}`;
}

/**
 * A reading set is one Lab per illuminant. A set missing one is refused rather
 * than filled in, because a metamerism index computed off two illuminants and a
 * guess is worse than no index.
 */
export function makeReadingSet(readings) {
  const out = {};
  for (const illuminant of ILLUMINANTS) {
    const reading = readings?.[illuminant];
    if (!reading || typeof reading.L !== 'number') {
      throw new FieldError('readings', `is missing a lab reading under ${illuminant}`, illuminant);
    }
    out[illuminant] = reading;
  }
  return Object.freeze(out);
}

/** The difference under each illuminant, in the formula the customer quotes. */
export function differencesByIlluminant(standard, batch, { formula = 'cmc', options } = {}) {
  requireOneOf(formula, 'formula', formulaNames());
  return Object.fromEntries(
    ILLUMINANTS.map((illuminant) => [
      illuminant,
      deltaE(formula, standard[illuminant], batch[illuminant], options),
    ])
  );
}

/**
 * The metamerism index. The primary illuminant is the one the pair was matched
 * under, and the index is how far the pair drifts under the others.
 */
export function metamerismIndex(
  standard,
  batch,
  { primary = 'D65', formula = 'cmc', options } = {}
) {
  requireOneOf(primary, 'primary', ILLUMINANTS);
  const differences = differencesByIlluminant(standard, batch, { formula, options });
  const others = ILLUMINANTS.filter((illuminant) => illuminant !== primary);
  const drifts = others.map((illuminant) =>
    Math.abs(differences[illuminant] - differences[primary])
  );
  return {
    primary,
    differences,
    worst: Math.max(...drifts),
    worstUnder: others[drifts.indexOf(Math.max(...drifts))],
    index: drifts.reduce((a, b) => a + b, 0) / drifts.length,
  };
}

/** Whether a pair is metameric enough to be worth refusing. */
export function isMetameric(result, { limit = 0.5 } = {}) {
  requirePositive(limit, 'limit');
  return result.worst > limit;
}

/**
 * Judge a pair under every illuminant. A pair that passes under the primary and
 * fails under another is reported as failing, because the customer will see it
 * under whichever one their shop is lit by.
 */
export function judgeAllIlluminants(standard, batch, tolerance, { primary = 'D65' } = {}) {
  const differences = differencesByIlluminant(standard, batch, {
    formula: tolerance.formula,
    options: tolerance.options,
  });
  const failing = ILLUMINANTS.filter((illuminant) => differences[illuminant] > tolerance.total);
  return {
    differences,
    primary,
    passesUnderPrimary: differences[primary] <= tolerance.total,
    failing,
    verdict: failing.length === 0 ? 'pass' : 'fail',
  };
}

/**
 * Whiteness and yellowness.
 *
 * Half of what this dyehouse runs is not a colour at all. It is a white, and a
 * white is judged on two indices that pull in opposite directions: whiteness
 * goes up with an optical brightener and tint goes blue with it, and past a
 * point the cloth reads grey rather than white to anybody looking at it.
 *
 * The formulae are the CIE ones for D65 and the ten degree observer, which is
 * what the works instrument is set to and what the customer specifications
 * quote.
 */

import { FieldError, requireInRange, requireNumber, requirePositive } from '../valid/guards.js';

/** The D65 ten degree white point chromaticity. */
export const WHITE_POINT = Object.freeze({ x: 0.3138, y: 0.331 });

/** The bounds the CIE whiteness formula is defined over. Outside them it lies. */
export const VALID = Object.freeze({ whiteness: [40, 160], tint: [-3, 3], Y: [70, 100] });

export function ciewhiteness({ Y, x, y }, whitePoint = WHITE_POINT) {
  requireInRange(Y, 'Y', 0, 100);
  requireNumber(x, 'x');
  requireNumber(y, 'y');
  return Y + 800 * (whitePoint.x - x) + 1700 * (whitePoint.y - y);
}

export function tint({ x, y }, whitePoint = WHITE_POINT) {
  requireNumber(x, 'x');
  requireNumber(y, 'y');
  return 1000 * (whitePoint.x - x) - 650 * (whitePoint.y - y);
}

/**
 * Whether a reading is inside the range the formula was fitted for. A whiteness
 * of 180 is not a whiter cloth, it is a number outside the formula.
 */
export function isInsideFormula(reading) {
  const w = ciewhiteness(reading);
  const t = tint(reading);
  const problems = [];
  if (reading.Y < VALID.Y[0]) problems.push(`Y of ${reading.Y.toFixed(1)} is below ${VALID.Y[0]}`);
  if (w < VALID.whiteness[0] || w > VALID.whiteness[1]) {
    problems.push(`whiteness of ${w.toFixed(1)} is outside ${VALID.whiteness.join(' to ')}`);
  }
  if (t < VALID.tint[0] || t > VALID.tint[1]) {
    problems.push(`tint of ${t.toFixed(2)} is outside ${VALID.tint.join(' to ')}`);
  }
  return { inside: problems.length === 0, problems, whiteness: w, tint: t };
}

/** Which way the tint reads, in the words the shade room uses. */
export function tintDescription(value, { threshold = 0.5 } = {}) {
  requirePositive(threshold, 'threshold');
  if (value > threshold) return 'greenish';
  if (value < -threshold) return 'reddish';
  return 'neutral';
}

/**
 * Judge a white against a specification. Both indices have to be met and the
 * tint is a window rather than a ceiling, because too blue is as wrong as too
 * yellow and only one of those is obvious to look at.
 */
export function judgeWhite(reading, specification) {
  const minimum = requireInRange(specification.minimumWhiteness, 'minimumWhiteness', 40, 160);
  const window = requirePositive(specification.tintWindow ?? 1, 'tintWindow');
  const check = isInsideFormula(reading);
  const breaches = [];
  if (check.whiteness < minimum) {
    breaches.push({ index: 'whiteness', value: check.whiteness, limit: minimum });
  }
  if (Math.abs(check.tint) > window) {
    breaches.push({ index: 'tint', value: check.tint, limit: window });
  }
  return {
    whiteness: check.whiteness,
    tint: check.tint,
    reads: tintDescription(check.tint),
    insideFormula: check.inside,
    verdict: breaches.length === 0 ? 'pass' : 'fail',
    breaches,
  };
}

/**
 * How much more brightener to add. Whiteness rises with the dose and then
 * turns over, so a build curve is fitted per quality and this reads off it
 * rather than extrapolating a straight line.
 */
export function brightenerAdvice(current, target, curve) {
  if (!Array.isArray(curve) || curve.length < 2) {
    throw new FieldError('curve', 'needs at least two measured points', curve);
  }
  const sorted = [...curve].sort((a, b) => a.dose - b.dose);
  const peak = sorted.reduce((best, point) => (point.whiteness > best.whiteness ? point : best));
  if (target > peak.whiteness) {
    return {
      possible: false,
      reason: `the build curve peaks at ${peak.whiteness.toFixed(1)} at ${peak.dose} percent`,
      dose: peak.dose,
    };
  }
  const rising = sorted.filter((point) => point.dose <= peak.dose);
  for (let i = 1; i < rising.length; i += 1) {
    const low = rising[i - 1];
    const high = rising[i];
    if (target >= low.whiteness && target <= high.whiteness) {
      const span = high.whiteness - low.whiteness;
      const dose =
        span === 0
          ? low.dose
          : low.dose + ((target - low.whiteness) / span) * (high.dose - low.dose);
      return { possible: true, dose, from: current, reason: 'read off the build curve' };
    }
  }
  return {
    possible: true,
    dose: rising[0].dose,
    from: current,
    reason: 'below the lowest measured dose',
  };
}

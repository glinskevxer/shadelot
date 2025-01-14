/**
 * Control charts on shade.
 *
 * A works that judges every batch against a tolerance and never looks at the
 * series has no way of telling a process that is drifting from one that is
 * noisy, and the two need different answers. The chart is a plain individuals
 * and moving range pair, which is what a dyehouse can actually keep because
 * every batch is one point and there are no subgroups to form.
 *
 * The limits are worked from the moving range rather than the standard
 * deviation, because a drift inflates the deviation and hides itself.
 */

import { requireArray, requireInRange, requirePositive, optional } from '../valid/guards.js';

/** The constant that turns a mean moving range into a sigma, for n of two. */
export const D2 = 1.128;

export function movingRanges(values) {
  requireArray(values, 'values', { min: 2 });
  return values.slice(1).map((value, index) => Math.abs(value - values[index]));
}

export function controlLimits(values, { sigmas = 3 } = {}) {
  requireArray(values, 'values', { min: 2 });
  requirePositive(sigmas, 'sigmas');
  const centre = values.reduce((a, b) => a + b, 0) / values.length;
  const ranges = movingRanges(values);
  const meanRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const sigma = meanRange / D2;
  return {
    centre,
    sigma,
    upper: centre + sigmas * sigma,
    lower: centre - sigmas * sigma,
    meanRange,
    rangeUpper: 3.267 * meanRange,
  };
}

/**
 * The four western electric rules this works uses. More of them exist and
 * running all eight on a dyehouse series produces a signal every week, which
 * teaches everybody to ignore the chart.
 */
export const RULES = Object.freeze([
  { name: 'one beyond three sigma', window: 1 },
  { name: 'two of three beyond two sigma', window: 3 },
  { name: 'eight on one side of centre', window: 8 },
  { name: 'six rising or falling', window: 6 },
]);

function beyond(values, limits, sigmas, side) {
  const bound = limits.centre + side * sigmas * limits.sigma;
  return values.filter((value) => (side > 0 ? value > bound : value < bound)).length;
}

export function signalsIn(values, options = {}) {
  const limits = controlLimits(values, options);
  const signals = [];
  values.forEach((value, index) => {
    if (Math.abs(value - limits.centre) > 3 * limits.sigma) {
      signals.push({ at: index, rule: 'one beyond three sigma', value });
      return;
    }
    const three = values.slice(Math.max(0, index - 2), index + 1);
    if (
      three.length === 3 &&
      (beyond(three, limits, 2, 1) >= 2 || beyond(three, limits, 2, -1) >= 2)
    ) {
      signals.push({ at: index, rule: 'two of three beyond two sigma', value });
      return;
    }
    const eight = values.slice(Math.max(0, index - 7), index + 1);
    if (eight.length === 8) {
      const above = eight.every((entry) => entry > limits.centre);
      const below = eight.every((entry) => entry < limits.centre);
      if (above || below) {
        signals.push({ at: index, rule: 'eight on one side of centre', value });
        return;
      }
    }
    const six = values.slice(Math.max(0, index - 5), index + 1);
    if (six.length === 6) {
      const rising = six.every((entry, i) => i === 0 || entry > six[i - 1]);
      const falling = six.every((entry, i) => i === 0 || entry < six[i - 1]);
      if (rising || falling) {
        signals.push({ at: index, rule: 'six rising or falling', value });
      }
    }
  });
  return { limits, signals, inControl: signals.length === 0 };
}

/**
 * Capability against a tolerance. A works in control and not capable is a
 * different problem from one capable and out of control, and both get called
 * "the shade is wandering".
 */
export function capability(values, tolerance, { target } = {}) {
  const limits = controlLimits(values);
  requirePositive(tolerance, 'tolerance');
  const centre = optional(target, Number, limits.centre);
  requireInRange(limits.sigma, 'sigma', 0, Number.MAX_VALUE);
  if (limits.sigma === 0) {
    return { cp: Infinity, cpk: Infinity, capable: true, inControl: true };
  }
  const cp = tolerance / (3 * limits.sigma);
  const drift = Math.abs(limits.centre - centre);
  const cpk = (tolerance - drift) / (3 * limits.sigma);
  return {
    cp,
    cpk,
    capable: cpk >= 1,
    drift,
    sigma: limits.sigma,
    inControl: signalsIn(values).inControl,
  };
}

/** Which of the two problems a series has, in the words to use in the meeting. */
export function diagnose(values, tolerance, options) {
  const study = capability(values, tolerance, options);
  if (study.inControl && study.capable) return 'steady and inside the tolerance';
  if (study.inControl && !study.capable) return 'steady but the spread is wider than the tolerance';
  if (!study.inControl && study.capable) return 'inside the tolerance but something is moving it';
  return 'both wandering and too wide, look at the process before the recipe';
}

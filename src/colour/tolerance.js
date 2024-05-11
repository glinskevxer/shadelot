/**
 * Tolerance blocks.
 *
 * A customer sends a tolerance as one number, which is never enough. A batch
 * inside a total of one CMC unit can still be visibly off if the whole of that
 * unit is hue, so the block carries per axis limits alongside the total and a
 * batch has to satisfy every one of them.
 *
 * The block also carries a direction bias. A shirting customer will take a batch
 * a shade darker and will not take one lighter, and writing that down here stops
 * it living in somebody's head.
 */

import {
  FieldError,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';
import { lchDifference } from './lab.js';
import { deltaE, formulaNames } from './deltae.js';

export const VERDICTS = ['pass', 'marginal', 'fail'];

export function makeTolerance(input) {
  const name = requireText(input.name, 'tolerance.name', { maxLength: 60 });
  const formula = requireOneOf(input.formula, 'tolerance.formula', formulaNames());
  const total = requirePositive(input.total, 'tolerance.total');
  const marginalAt = optional(
    input.marginalAt,
    (v) => requirePositive(v, 'tolerance.marginalAt'),
    total * 0.8
  );
  if (marginalAt > total) {
    throw new FieldError('tolerance.marginalAt', 'must sit at or below the total', marginalAt);
  }
  const axes = {
    dL: optional(input.dL, (v) => requirePositive(v, 'tolerance.dL'), null),
    dC: optional(input.dC, (v) => requirePositive(v, 'tolerance.dC'), null),
    dH: optional(input.dH, (v) => requirePositive(v, 'tolerance.dH'), null),
  };
  const bias = {
    dL: optional(
      input.biasL,
      (v) => requireOneOf(v, 'tolerance.biasL', ['light', 'dark', 'none']),
      'none'
    ),
  };
  return Object.freeze({
    name,
    formula,
    total,
    marginalAt,
    axes: Object.freeze(axes),
    bias: Object.freeze(bias),
    options: Object.freeze({ ...(input.options ?? {}) }),
  });
}

function axisBreaches(tolerance, difference) {
  const breaches = [];
  for (const axis of ['dL', 'dC', 'dH']) {
    const limit = tolerance.axes[axis];
    if (limit !== null && Math.abs(difference[axis]) > limit) {
      breaches.push({ axis, value: difference[axis], limit });
    }
  }
  return breaches;
}

function biasBreach(tolerance, difference) {
  if (tolerance.bias.dL === 'light' && difference.dL < 0) {
    return { axis: 'dL', value: difference.dL, limit: 0, note: 'the batch may not run darker' };
  }
  if (tolerance.bias.dL === 'dark' && difference.dL > 0) {
    return { axis: 'dL', value: difference.dL, limit: 0, note: 'the batch may not run lighter' };
  }
  return null;
}

/**
 * Judge a batch. The total and the axes are read together and a breach of
 * either fails the batch, so a block with tight axes is tighter than its total
 * suggests.
 */
export function judge(tolerance, standard, batch) {
  const value = deltaE(tolerance.formula, standard, batch, tolerance.options);
  const difference = lchDifference(standard, batch);
  const breaches = axisBreaches(tolerance, difference);
  const bias = biasBreach(tolerance, difference);
  if (bias) breaches.push(bias);

  let verdict = 'pass';
  if (value > tolerance.total || breaches.length > 0) {
    verdict = 'fail';
  } else if (value > tolerance.marginalAt) {
    verdict = 'marginal';
  }

  return { verdict, value, formula: tolerance.formula, difference, breaches };
}

export function isAcceptable(result, { allowMarginal = true } = {}) {
  if (!VERDICTS.includes(result.verdict)) {
    throw new FieldError('verdict', `must be one of ${VERDICTS.join(', ')}`, result.verdict);
  }
  return result.verdict === 'pass' || (allowMarginal && result.verdict === 'marginal');
}

/** The works default, which is what a job with no customer block is judged on. */
export const WORKS_DEFAULT = makeTolerance({
  name: 'works default',
  formula: 'cmc',
  total: 1,
  dL: 0.7,
  dC: 0.7,
  dH: 0.7,
});

/**
 * Right first time.
 *
 * The headline number of a dyehouse, and the one most easily fiddled. A batch
 * that was added on to and then shipped is not right first time, whatever the
 * despatch note says, and a batch that was scrapped is not a right first time
 * failure of nothing: it is a failure that also cost the cloth.
 *
 * So the counting rules are written down here rather than left to a
 * spreadsheet, and every number the works publishes comes through this module.
 */

import { FieldError, requireArray, requireOneOf, requirePositive } from '../valid/guards.js';

export const OUTCOMES = ['first-time', 'corrected', 'downgraded', 'scrapped'];

/** How a batch counts, from what actually happened to it. */
export function classify(batch) {
  const passes = requirePositive(batch.passes ?? 1, 'batch.passes');
  if (batch.scrapped === true) return 'scrapped';
  if (batch.downgraded === true) return 'downgraded';
  if (passes > 1) return 'corrected';
  if (batch.accepted !== true) {
    throw new FieldError(
      'batch.accepted',
      'is not set on a batch that was not corrected',
      batch.id
    );
  }
  return 'first-time';
}

export function tally(batches) {
  requireArray(batches, 'batches', { min: 1 });
  const counts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  const kg = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  for (const batch of batches) {
    const outcome = classify(batch);
    counts[outcome] += 1;
    kg[outcome] += requirePositive(batch.fibreKg, 'batch.fibreKg');
  }
  return { counts, kg, batches: batches.length };
}

/** By batch count, which is what the board on the wall shows. */
export function byBatch(batches) {
  const { counts, batches: total } = tally(batches);
  return counts['first-time'] / total;
}

/**
 * By weight, which is the honest one. A works that gets every small batch right
 * and every large one wrong reads well on the wall and badly here.
 */
export function byWeight(batches) {
  const { kg } = tally(batches);
  const total = OUTCOMES.reduce((sum, outcome) => sum + kg[outcome], 0);
  requirePositive(total, 'total weight');
  return kg['first-time'] / total;
}

/** The gap between the two, which is the number worth looking at. */
export function weightBias(batches) {
  return byWeight(batches) - byBatch(batches);
}

/**
 * A run chart of the rate over a window, which is how a trend is read without
 * anybody deciding what a trend is.
 */
export function rollingRate(batches, { window = 20, measure = 'batch' } = {}) {
  requirePositive(window, 'window');
  requireOneOf(measure, 'measure', ['batch', 'weight']);
  const rate = measure === 'weight' ? byWeight : byBatch;
  const points = [];
  for (let end = window; end <= batches.length; end += 1) {
    const slice = batches.slice(end - window, end);
    points.push({ at: end, rate: rate(slice) });
  }
  return points;
}

/** Where the failures went, largest first, which is where to spend the week. */
export function failureModes(batches) {
  const { counts, batches: total } = tally(batches);
  return OUTCOMES.filter((outcome) => outcome !== 'first-time')
    .map((outcome) => ({ outcome, count: counts[outcome], share: counts[outcome] / total }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

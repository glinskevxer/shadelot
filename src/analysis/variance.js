/**
 * Variance.
 *
 * A month that came in over budget did so for a reason, and there are only four
 * reasons: more cloth than planned, a different mix of shades, dearer inputs, or
 * more of them per kilogram. Splitting the total into those four in that order
 * is standard practice and the order matters: each variance is measured with
 * everything before it already moved to actual.
 *
 * Doing it in another order gives different numbers that also add up, which is
 * why the order is written down here rather than left to whoever runs it.
 */

import { requireArray, requireNonNegative, requirePositive } from '../valid/guards.js';

export const VARIANCE_ORDER = Object.freeze(['volume', 'mix', 'price', 'rate']);

function totals(rows) {
  return rows.reduce(
    (sum, row) => ({
      kg: sum.kg + row.kg,
      cost: sum.cost + row.kg * row.perKg,
    }),
    { kg: 0, cost: 0 }
  );
}

function mixShares(rows, kg) {
  return Object.fromEntries(rows.map((row) => [row.band, row.kg / kg]));
}

/**
 * Split the difference between a plan and an actual. Rows are per shade band:
 * kilograms, and cost per kilogram split into inputs and rate.
 */
export function splitVariance(plan, actual) {
  requireArray(plan, 'plan', { min: 1 });
  requireArray(actual, 'actual', { min: 1 });
  const planned = totals(plan);
  const real = totals(actual);
  requirePositive(planned.kg, 'planned kg');
  requirePositive(real.kg, 'actual kg');

  const plannedRate = planned.cost / planned.kg;
  const plannedShares = mixShares(plan, planned.kg);
  const actualShares = mixShares(actual, real.kg);
  const plannedPerKg = Object.fromEntries(plan.map((row) => [row.band, row.perKg]));
  const actualPerKg = Object.fromEntries(actual.map((row) => [row.band, row.perKg]));

  const volume = (real.kg - planned.kg) * plannedRate;

  const bands = [...new Set([...Object.keys(plannedShares), ...Object.keys(actualShares)])];
  const mix = bands.reduce((sum, band) => {
    const shareMove = (actualShares[band] ?? 0) - (plannedShares[band] ?? 0);
    return sum + shareMove * real.kg * (plannedPerKg[band] ?? plannedRate);
  }, 0);

  const rate = bands.reduce((sum, band) => {
    const kg = (actualShares[band] ?? 0) * real.kg;
    const move = (actualPerKg[band] ?? 0) - (plannedPerKg[band] ?? plannedRate);
    return sum + kg * move;
  }, 0);

  const total = real.cost - planned.cost;
  return {
    plannedCost: planned.cost,
    actualCost: real.cost,
    total,
    volume,
    mix,
    rate,
    unexplained: total - (volume + mix + rate),
  };
}

/** Whether the split accounts for the whole difference, to a penny. */
export function reconciles(variance, { tolerance = 0.01 } = {}) {
  requireNonNegative(tolerance, 'tolerance');
  return Math.abs(variance.unexplained) <= tolerance;
}

/** The variances largest first by magnitude, which is the order to explain them in. */
export function ranked(variance) {
  return ['volume', 'mix', 'rate']
    .map((name) => ({ name, value: variance[name] }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** A one line summary that says whether the month was over or under and by how much. */
export function describe(variance) {
  const direction = variance.total > 0 ? 'over' : 'under';
  const first = ranked(variance)[0];
  return `${Math.abs(variance.total).toFixed(2)} ${direction}, mostly ${first.name}`;
}

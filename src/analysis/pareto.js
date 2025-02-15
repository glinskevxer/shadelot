/**
 * Pareto.
 *
 * A dyehouse with a right first time problem has one problem, not fifteen, and
 * finding which one it is means counting the failures against something rather
 * than looking at a list. This does the counting and stops where the cumulative
 * share crosses a line, which is the whole of the technique.
 *
 * The interesting part is the second cut. Failures counted by batch and by
 * kilogram give different answers, and a works that only ever looks at the
 * first one spends its year on the wrong machine.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requirePositive,
  optional,
} from '../valid/guards.js';

export function tallyBy(rows, key, { weight = () => 1 } = {}) {
  requireArray(rows, 'rows', { min: 1 });
  const totals = new Map();
  for (const row of rows) {
    const value = row[key];
    if (value === undefined || value === null) {
      throw new FieldError('key', `is not on every row, ${row.id ?? 'a row'} has no ${key}`, key);
    }
    totals.set(value, (totals.get(value) ?? 0) + weight(row));
  }
  return totals;
}

/**
 * The ordered table with the running share down the side. The cut is where the
 * running share first crosses the threshold, and everything from there on is
 * marked as tail rather than dropped, because somebody always asks.
 */
export function pareto(rows, key, { weight, threshold = 0.8 } = {}) {
  requireInRange(threshold, 'threshold', 0.1, 1);
  const totals = tallyBy(rows, key, { weight });
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  requirePositive(grand, 'total');
  let running = 0;
  let crossed = false;
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([value, count]) => {
      running += count;
      const share = count / grand;
      const cumulative = running / grand;
      const vital = !crossed;
      if (cumulative >= threshold) crossed = true;
      return { value, count, share, cumulative, vital };
    });
}

/** The few that carry the threshold, which is the answer somebody wanted. */
export function vitalFew(rows, key, options) {
  return pareto(rows, key, options)
    .filter((row) => row.vital)
    .map((row) => row.value);
}

/**
 * Whether counting by batch and by weight point at the same thing. When they do
 * not, the by weight answer is the one to act on and the disagreement is worth
 * saying out loud.
 */
export function compareCuts(rows, key, { weight, threshold = 0.8 } = {}) {
  const byCount = vitalFew(rows, key, { threshold });
  const byWeight = vitalFew(rows, key, { weight: weight ?? ((row) => row.fibreKg), threshold });
  const agree =
    byCount.length === byWeight.length && byCount.every((value, i) => value === byWeight[i]);
  return {
    byCount,
    byWeight,
    agree,
    note: agree
      ? 'both cuts point at the same thing'
      : 'the cuts disagree, act on the weight one and say so',
  };
}

/** A crude bar for a terminal, so the table reads at a glance. */
export function bar(share, { width = 24 } = {}) {
  requirePositive(width, 'width');
  requireInRange(share, 'share', 0, 1);
  const filled = Math.round(share * optional(width, Number, 24));
  return '#'.repeat(filled).padEnd(width, '.');
}

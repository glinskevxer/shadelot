/**
 * Benchmarks.
 *
 * A works number on its own says nothing. Forty litres a kilogram is either
 * good or terrible depending on what is being dyed and on what everybody else
 * manages, and the figures below are the published trade ranges rather than an
 * opinion.
 *
 * The important part is that a benchmark is a band and not a target. Reporting
 * a works as a position inside a band tells somebody whether to act; reporting
 * it against a single number tells them they are failing at everything.
 */

import { FieldError, requireInRange, requireOneOf, requirePositive } from '../valid/guards.js';

/** Published ranges, best first, for a commission dyehouse on cotton. */
export const BANDS = Object.freeze({
  litresPerKg: { best: 30, typical: 70, poor: 140, lowerIsBetter: true, units: 'litres per kg' },
  kwhPerKg: { best: 2.5, typical: 5.5, poor: 11, lowerIsBetter: true, units: 'kWh per kg' },
  rightFirstTime: { best: 0.95, typical: 0.85, poor: 0.7, lowerIsBetter: false, units: 'fraction' },
  costPerKg: { best: 1.1, typical: 1.8, poor: 3.2, lowerIsBetter: true, units: 'per kg' },
  utilisation: { best: 0.85, typical: 0.65, poor: 0.4, lowerIsBetter: false, units: 'fraction' },
  fixation: { best: 0.85, typical: 0.72, poor: 0.55, lowerIsBetter: false, units: 'fraction' },
});

export function measures() {
  return Object.keys(BANDS);
}

export function bandFor(measure) {
  const band = BANDS[measure];
  if (!band) {
    throw new FieldError('measure', `must be one of ${measures().join(', ')}`, measure);
  }
  return band;
}

export const VERDICTS = ['best', 'good', 'typical', 'behind', 'poor'];

/**
 * Where a value sits in its band, as a fraction from poor at nought to best at
 * one. Values outside the band clamp, because a works at half the best figure is
 * a measurement error rather than a triumph.
 */
export function position(measure, value) {
  const band = bandFor(measure);
  requirePositive(value, measure);
  const span = band.best - band.poor;
  const raw = (value - band.poor) / span;
  return Math.max(0, Math.min(1, raw));
}

export function verdictFor(measure, value) {
  const where = position(measure, value);
  const band = bandFor(measure);
  const typicalAt = (band.typical - band.poor) / (band.best - band.poor);
  if (where >= 0.95) return 'best';
  if (where >= (1 + typicalAt) / 2) return 'good';
  if (where >= typicalAt) return 'typical';
  if (where > 0) return 'behind';
  return 'poor';
}

/** One works measure, with what it would take to move up a step. */
export function assess(measure, value) {
  const band = bandFor(measure);
  const verdict = verdictFor(measure, value);
  const where = position(measure, value);
  return {
    measure,
    value,
    units: band.units,
    position: where,
    verdict,
    typical: band.typical,
    best: band.best,
    gapToTypical: band.lowerIsBetter ? value - band.typical : band.typical - value,
    gapToBest: band.lowerIsBetter ? value - band.best : band.best - value,
  };
}

/** A whole works, ordered worst first, which is the order to spend money in. */
export function assessWorks(values) {
  const rows = Object.entries(values)
    .filter(([measure]) => BANDS[measure] !== undefined)
    .map(([measure, value]) => assess(measure, value))
    .sort((a, b) => a.position - b.position);
  if (rows.length === 0) {
    throw new FieldError('values', 'names nothing this benchmarks', Object.keys(values));
  }
  return {
    rows,
    worst: rows[0],
    best: rows.at(-1),
    mean: rows.reduce((sum, row) => sum + row.position, 0) / rows.length,
  };
}

/** Whether a works is behind on enough measures to be worth a project. */
export function needsAttention(assessment, { threshold = 0.4, count = 2 } = {}) {
  requireInRange(threshold, 'threshold', 0, 1);
  requirePositive(count, 'count');
  const behind = assessment.rows.filter((row) => row.position < threshold);
  return { needed: behind.length >= count, behind: behind.map((row) => row.measure) };
}

export function requireVerdict(value) {
  return requireOneOf(value, 'verdict', VERDICTS);
}

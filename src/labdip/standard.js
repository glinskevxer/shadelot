/**
 * The standards register.
 *
 * A customer standard is a physical thing: a piece of cloth in an envelope in a
 * drawer, and it fades. Everything downstream is measured against it, so a
 * standard that has drifted quietly takes the whole works with it, and the only
 * defence is to measure it again on a schedule and keep every reading.
 *
 * A standard is never edited. A re-measured one is a new reading on the same
 * standard, and the drift between the first and the last is the number that
 * matters.
 */

import {
  FieldError,
  requireArray,
  requireInteger,
  requireOneOf,
  requireText,
  optional,
} from '../valid/guards.js';
import { deltaE, formulaNames } from '../colour/deltae.js';

export const SOURCES = Object.freeze(['customer', 'works', 'pantone', 'previous-bulk']);

export function makeStandard(input) {
  const readings = requireArray(input.readings, 'standard.readings', { min: 1 }).map((reading) => ({
    at: requireText(reading.at, 'reading.at', { maxLength: 32 }),
    reading: reading.reading,
    by: optional(reading.by, (v) => requireText(v, 'reading.by', { maxLength: 60 }), 'lab'),
  }));
  for (const entry of readings) {
    if (!entry.reading || typeof entry.reading.L !== 'number') {
      throw new FieldError('reading.reading', 'must be a lab reading', entry.at);
    }
  }
  return {
    id: requireText(input.id, 'standard.id', { maxLength: 24 }),
    name: requireText(input.name, 'standard.name', { maxLength: 80 }),
    customer: requireText(input.customer, 'standard.customer', { maxLength: 80 }),
    source: requireOneOf(optional(input.source, String, 'customer'), 'standard.source', SOURCES),
    substrate: optional(input.substrate, (v) => requireText(v, 'standard.substrate'), null),
    remeasureMonths: requireInteger(
      optional(input.remeasureMonths, Number, 6),
      'standard.remeasureMonths'
    ),
    readings: readings.sort((a, b) => a.at.localeCompare(b.at)),
    retired: input.retired === true,
  };
}

export function currentReading(standard) {
  return standard.readings.at(-1);
}

export function firstReading(standard) {
  return standard.readings[0];
}

export function remeasure(standard, { at, reading, by }) {
  if (standard.retired) {
    throw new FieldError(
      'standard.retired',
      'is retired and takes no further readings',
      standard.id
    );
  }
  const entry = {
    at: requireText(at, 'at', { maxLength: 32 }),
    reading,
    by: optional(by, (v) => requireText(v, 'by', { maxLength: 60 }), 'lab'),
  };
  if (!reading || typeof reading.L !== 'number') {
    throw new FieldError('reading', 'must be a lab reading', at);
  }
  if (standard.readings.some((existing) => existing.at === entry.at)) {
    throw new FieldError('at', 'already carries a reading on this standard', at);
  }
  standard.readings.push(entry);
  standard.readings.sort((a, b) => a.at.localeCompare(b.at));
  return entry;
}

/** How far the physical standard has moved since it was first measured. */
export function drift(standard, { formula = 'cmc' } = {}) {
  requireOneOf(formula, 'formula', formulaNames());
  if (standard.readings.length < 2) {
    return { measured: false, value: 0, readings: standard.readings.length };
  }
  const first = firstReading(standard);
  const latest = currentReading(standard);
  return {
    measured: true,
    value: deltaE(formula, first.reading, latest.reading),
    from: first.at,
    to: latest.at,
    readings: standard.readings.length,
  };
}

/** Whether a standard has drifted enough to stop using it. */
export function isTrustworthy(standard, { limit = 0.5, formula = 'cmc' } = {}) {
  const moved = drift(standard, { formula });
  if (standard.retired) return { trustworthy: false, reason: 'the standard is retired' };
  if (!moved.measured) {
    return { trustworthy: true, reason: 'measured once, nothing to compare it to' };
  }
  if (moved.value > limit) {
    return {
      trustworthy: false,
      reason: `it has moved ${moved.value.toFixed(3)} since ${moved.from}, ask for a fresh one`,
    };
  }
  return {
    trustworthy: true,
    reason: `it has held to ${moved.value.toFixed(3)} since ${moved.from}`,
  };
}

/** Standards due a re-measure, which is the list the lab works through. */
export function dueForRemeasure(
  standards,
  today,
  { monthsFor = (standard) => standard.remeasureMonths } = {}
) {
  requireText(today, 'today', { maxLength: 32 });
  return standards
    .filter((standard) => !standard.retired)
    .map((standard) => {
      const latest = currentReading(standard);
      const due = addMonths(latest.at, monthsFor(standard));
      return { id: standard.id, name: standard.name, lastMeasured: latest.at, dueAt: due };
    })
    .filter((row) => row.dueAt <= today)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function addMonths(date, months) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new FieldError('date', 'must be an ISO calendar date', date);
  }
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Shelf life.
 *
 * Dyes and auxiliaries do not keep forever, and the ways they fail are
 * different. A reactive dye hydrolyses slowly in the drum and loses strength
 * that nobody notices until a shade comes out weak. An emulsion splits and is
 * obviously ruined. So the register carries both a use by date and a strength
 * decay, and a lot past its date is not automatically scrap.
 */

import {
  FieldError,
  requireInRange,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const STABILITY = Object.freeze(['stable', 'slow-decay', 'splits']);

/** Percent of strength lost per month at works temperature, by stability class. */
export const DECAY_PER_MONTH = Object.freeze({ stable: 0, 'slow-decay': 0.6, splits: 0 });

export const STATES = Object.freeze(['good', 'watch', 'retest', 'scrap']);

export function makeShelfEntry(input) {
  return Object.freeze({
    code: requireText(input.code, 'shelf.code', { maxLength: 32 }),
    stability: requireOneOf(input.stability, 'shelf.stability', STABILITY),
    monthsToUseBy: requirePositive(input.monthsToUseBy, 'shelf.monthsToUseBy'),
    retestMonths: optional(
      input.retestMonths,
      (v) => requirePositive(v, 'shelf.retestMonths'),
      null
    ),
    minimumStrength: requireInRange(
      optional(input.minimumStrength, Number, 95),
      'shelf.minimumStrength',
      50,
      100
    ),
  });
}

export function monthsBetween(from, to) {
  const start = new Date(`${requireText(from, 'from', { maxLength: 32 })}T00:00:00Z`);
  const end = new Date(`${requireText(to, 'to', { maxLength: 32 })}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new FieldError('date', 'must be an ISO calendar date', `${from} to ${to}`);
  }
  return (end - start) / (1000 * 60 * 60 * 24 * 30.4375);
}

/** Strength now, from the strength on the certificate and the months since. */
export function strengthNow(entry, certificateStrength, months) {
  requirePositive(certificateStrength, 'certificateStrength');
  if (months < 0) {
    throw new FieldError('months', 'cannot be negative, the lot has not been received yet', months);
  }
  const rate = DECAY_PER_MONTH[entry.stability];
  return Math.max(0, certificateStrength - rate * months);
}

/**
 * What to do with a lot. A dye that only loses strength gets retested and
 * re-certified rather than scrapped; one that splits is scrapped on the date.
 */
export function assess(entry, lot, today) {
  const months = monthsBetween(lot.receivedAt, today);
  const strength = strengthNow(entry, lot.strength ?? 100, months);
  const pastUseBy = months > entry.monthsToUseBy;

  if (entry.stability === 'splits' && pastUseBy) {
    return {
      state: 'scrap',
      months,
      strength,
      reason: 'an emulsion past its date is not recoverable',
    };
  }
  if (strength < entry.minimumStrength) {
    return {
      state: pastUseBy ? 'scrap' : 'retest',
      months,
      strength,
      reason: `strength has fallen to ${strength.toFixed(1)} against a floor of ${entry.minimumStrength}`,
    };
  }
  if (pastUseBy) {
    return {
      state: 'retest',
      months,
      strength,
      reason: 'past the use by date but still to strength',
    };
  }
  if (entry.retestMonths !== null && months > entry.retestMonths) {
    return {
      state: 'watch',
      months,
      strength,
      reason: 'due a retest before it is used on a critical shade',
    };
  }
  return { state: 'good', months, strength, reason: 'inside date and to strength' };
}

/** The lots to look at, worst first, which is what the store walks with a list. */
export function review(book, lots, today) {
  return lots
    .map((lot) => {
      const entry = book.get(lot.code);
      if (!entry) {
        throw new FieldError('lot.code', 'has no shelf life entry', lot.code);
      }
      return { lotId: lot.lotId, code: lot.code, ...assess(entry, lot, today) };
    })
    .filter((row) => row.state !== 'good')
    .sort((a, b) => STATES.indexOf(b.state) - STATES.indexOf(a.state) || b.months - a.months);
}

export function createShelfBook(entries = []) {
  const book = new Map();
  for (const entry of entries) {
    if (book.has(entry.code)) {
      throw new FieldError('shelf.code', 'appears twice in the book', entry.code);
    }
    book.set(entry.code, entry);
  }
  return book;
}

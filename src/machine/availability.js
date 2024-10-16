/**
 * Machine availability.
 *
 * A machine is not available because it is not broken. It is available for the
 * hours the shift pattern gives it, less planned maintenance, less whatever it
 * is already committed to. Those three are kept separate because they are owned
 * by three different people and the argument about a late order always turns
 * into an argument about which of the three was wrong.
 */

import {
  FieldError,
  requireArray,
  requireNonNegative,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const SHIFT_PATTERNS = Object.freeze({
  single: 8,
  double: 16,
  continental: 21,
  continuous: 24,
});

export function shiftHours(pattern) {
  const hours = SHIFT_PATTERNS[pattern];
  if (hours === undefined) {
    throw new FieldError(
      'pattern',
      `must be one of ${Object.keys(SHIFT_PATTERNS).join(', ')}`,
      pattern
    );
  }
  return hours;
}

export function makeCalendar(input) {
  return {
    machineId: requireText(input.machineId, 'calendar.machineId', { maxLength: 24 }),
    pattern: requireText(optional(input.pattern, String, 'double'), 'calendar.pattern'),
    outages: requireArray(
      optional(input.outages, (v) => v, []),
      'calendar.outages'
    ).map((outage) => ({
      from: requireText(outage.from, 'outage.from', { maxLength: 32 }),
      to: requireText(outage.to, 'outage.to', { maxLength: 32 }),
      hours: requirePositive(outage.hours, 'outage.hours'),
      reason: requireText(outage.reason, 'outage.reason', { maxLength: 80 }),
      planned: outage.planned !== false,
    })),
    commitments: [],
  };
}

export function commit(calendar, { batchId, day, hours }) {
  requireText(batchId, 'batchId', { maxLength: 24 });
  requireText(day, 'day', { maxLength: 32 });
  requirePositive(hours, 'hours');
  if (calendar.commitments.some((entry) => entry.batchId === batchId)) {
    throw new FieldError('batchId', 'is already committed on this machine', batchId);
  }
  const entry = { batchId, day, hours };
  calendar.commitments.push(entry);
  return entry;
}

export function releaseCommitment(calendar, batchId) {
  const index = calendar.commitments.findIndex((entry) => entry.batchId === batchId);
  if (index === -1) return false;
  calendar.commitments.splice(index, 1);
  return true;
}

function outageHoursOn(calendar, day, { plannedOnly = false } = {}) {
  return calendar.outages
    .filter((outage) => outage.from <= day && day <= outage.to)
    .filter((outage) => !plannedOnly || outage.planned)
    .reduce((sum, outage) => sum + outage.hours, 0);
}

/** The three numbers, kept apart, plus what is left after all of them. */
export function availabilityOn(calendar, day) {
  const nominal = shiftHours(calendar.pattern);
  const outage = Math.min(nominal, outageHoursOn(calendar, day));
  const committed = calendar.commitments
    .filter((entry) => entry.day === day)
    .reduce((sum, entry) => sum + entry.hours, 0);
  return {
    machineId: calendar.machineId,
    day,
    nominal,
    outage,
    committed,
    free: Math.max(0, nominal - outage - committed),
    overcommitted: Math.max(0, committed - (nominal - outage)),
  };
}

/** Whether a batch of a given length can still be fitted on a day. */
export function canFit(calendar, day, hours) {
  requirePositive(hours, 'hours');
  return availabilityOn(calendar, day).free >= hours;
}

/** The first day from a list on which a batch will fit. */
export function firstFreeDay(calendar, days, hours) {
  requireArray(days, 'days', { min: 1 });
  return days.find((day) => canFit(calendar, day, hours)) ?? null;
}

/** Utilisation over a run of days, which is what a plant report shows. */
export function utilisationOver(calendar, days) {
  requireArray(days, 'days', { min: 1 });
  const totals = days.reduce(
    (sum, day) => {
      const row = availabilityOn(calendar, day);
      return {
        nominal: sum.nominal + row.nominal,
        outage: sum.outage + row.outage,
        committed: sum.committed + row.committed,
      };
    },
    { nominal: 0, outage: 0, committed: 0 }
  );
  const runnable = totals.nominal - totals.outage;
  requireNonNegative(runnable, 'runnable hours');
  return {
    ...totals,
    days: days.length,
    runnable,
    utilisation: runnable === 0 ? null : totals.committed / runnable,
  };
}

/**
 * The audit trail.
 *
 * A customer asking why their batch came out the way it did is asking a
 * question about a sequence of decisions, most of which were made by somebody
 * who has gone home. So every decision the program makes on its own gets an
 * entry, with the inputs that produced it.
 *
 * Entries are append only. There is no edit and no delete, because a trail that
 * can be edited answers no question anybody would ask it.
 */

import { FieldError, requireArray, requireOneOf, requireText, optional } from '../valid/guards.js';

export const EVENTS = Object.freeze([
  'lot-formed',
  'batch-planned',
  'recipe-redosed',
  'card-issued',
  'shade-judged',
  'correction-decided',
  'batch-delivered',
  'stock-issued',
]);

export function createTrail({ clock = () => new Date().toISOString() } = {}) {
  return { entries: [], clock };
}

export function append(trail, event, detail = {}) {
  requireOneOf(event, 'event', EVENTS);
  const subject = requireText(detail.subject, 'detail.subject', { maxLength: 64 });
  const entry = Object.freeze({
    sequence: trail.entries.length + 1,
    at: trail.clock(),
    event,
    subject,
    by: optional(detail.by, (v) => requireText(v, 'detail.by', { maxLength: 60 }), 'shadelot'),
    inputs: Object.freeze({ ...(detail.inputs ?? {}) }),
    outcome: optional(
      detail.outcome,
      (v) => requireText(v, 'detail.outcome', { maxLength: 200 }),
      null
    ),
  });
  trail.entries.push(entry);
  return entry;
}

export function forSubject(trail, subject) {
  return trail.entries.filter((entry) => entry.subject === subject);
}

export function ofEvent(trail, event) {
  requireOneOf(event, 'event', EVENTS);
  return trail.entries.filter((entry) => entry.event === event);
}

/**
 * The story of one subject in plain lines, which is what gets pasted into a
 * reply to a customer.
 */
export function narrate(trail, subject) {
  const entries = forSubject(trail, subject);
  if (entries.length === 0) {
    throw new FieldError('subject', 'has nothing on the trail', subject);
  }
  return entries.map((entry) => {
    const inputs = Object.entries(entry.inputs)
      .map(([key, value]) => `${key} ${value}`)
      .join(', ');
    const tail = entry.outcome ? `, ${entry.outcome}` : '';
    return `${entry.at}  ${entry.event}${inputs ? ` (${inputs})` : ''}${tail}`;
  });
}

/**
 * Whether the trail is intact: the sequence numbers run from one with no gap
 * and no repeat, and the times never go backwards.
 */
export function verify(trail) {
  const problems = [];
  trail.entries.forEach((entry, index) => {
    if (entry.sequence !== index + 1) {
      problems.push({ at: index, problem: `sequence is ${entry.sequence}, expected ${index + 1}` });
    }
    if (index > 0 && entry.at < trail.entries[index - 1].at) {
      problems.push({ at: index, problem: 'the clock went backwards' });
    }
  });
  return { intact: problems.length === 0, problems };
}

/** Merge two trails, which happens when a works runs a machine hall on its own file. */
export function merge(trails) {
  requireArray(trails, 'trails', { min: 1 });
  const entries = trails
    .flatMap((trail) => trail.entries)
    .sort((a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence)
    .map((entry, index) => Object.freeze({ ...entry, sequence: index + 1 }));
  return { entries, clock: trails[0].clock };
}

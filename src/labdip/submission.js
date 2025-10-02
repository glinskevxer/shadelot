/**
 * Lab dips.
 *
 * A customer sends a standard and the lab sends back dips until one is
 * approved. The thing worth recording is not the winning dip but the whole
 * series, because the next enquiry for a similar shade starts from whichever
 * earlier dip came closest and that is only findable if the losers were kept.
 */

import {
  FieldError,
  requireArray,
  requireInteger,
  requireOneOf,
  requireText,
  optional,
} from '../valid/guards.js';
import { judge } from '../colour/tolerance.js';

export const OUTCOMES = Object.freeze(['pending', 'approved', 'rejected', 'withdrawn']);

export function makeSubmission(input) {
  const id = requireText(input.id, 'submission.id', { maxLength: 24 });
  const customer = requireText(input.customer, 'submission.customer', { maxLength: 80 });
  const standardName = requireText(input.standardName, 'submission.standardName', {
    maxLength: 80,
  });
  const standard = input.standard;
  if (!standard || typeof standard.L !== 'number') {
    throw new FieldError('submission.standard', 'must be a lab reading', standard);
  }
  const substrate = requireText(input.substrate, 'submission.substrate', { maxLength: 40 });
  const tolerance = input.tolerance;
  if (!tolerance || typeof tolerance.total !== 'number') {
    throw new FieldError('submission.tolerance', 'must be a tolerance block', tolerance);
  }
  return {
    id,
    customer,
    standardName,
    standard,
    substrate,
    tolerance,
    dips: [],
    outcome: 'pending',
    approvedDip: null,
  };
}

export function addDip(submission, dip) {
  if (submission.outcome !== 'pending') {
    throw new FieldError(
      'submission.outcome',
      `is ${submission.outcome}, no further dips`,
      submission.outcome
    );
  }
  const recipeId = requireText(dip.recipeId, 'dip.recipeId', { maxLength: 24 });
  const reading = dip.reading;
  if (!reading || typeof reading.L !== 'number') {
    throw new FieldError('dip.reading', 'must be a lab reading', reading);
  }
  const round = optional(
    dip.round,
    (v) => requireInteger(v, 'dip.round'),
    submission.dips.length + 1
  );
  const result = judge(submission.tolerance, submission.standard, reading);
  const entry = Object.freeze({
    round,
    recipeId,
    reading,
    verdict: result.verdict,
    value: result.value,
    difference: result.difference,
    breaches: Object.freeze(result.breaches),
    note: optional(dip.note, (v) => requireText(v, 'dip.note', { maxLength: 200 }), null),
  });
  submission.dips.push(entry);
  return entry;
}

export function closeSubmission(submission, outcome, { round } = {}) {
  requireOneOf(outcome, 'outcome', OUTCOMES);
  if (outcome === 'pending') {
    throw new FieldError('outcome', 'cannot be set back to pending', outcome);
  }
  if (submission.outcome !== 'pending') {
    throw new FieldError(
      'submission.outcome',
      `is already ${submission.outcome}`,
      submission.outcome
    );
  }
  if (outcome === 'approved') {
    const chosen =
      round === undefined ? bestDip(submission) : submission.dips.find((d) => d.round === round);
    if (!chosen) {
      throw new FieldError('round', 'names no dip on this submission', round);
    }
    submission.approvedDip = chosen;
  }
  submission.outcome = outcome;
  return submission;
}

/** The dip that came closest, whether or not it passed. */
export function bestDip(submission) {
  requireArray(submission.dips, 'submission.dips', { min: 1 });
  return submission.dips.reduce((best, dip) => (dip.value < best.value ? dip : best));
}

export function passingDips(submission) {
  return submission.dips.filter((dip) => dip.verdict !== 'fail');
}

/** How many rounds it took, which is the number the lab is measured on. */
export function roundsTaken(submission) {
  return submission.dips.length;
}

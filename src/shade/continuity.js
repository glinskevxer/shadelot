/**
 * Shade continuity across an order.
 *
 * A customer ordering nine thousand metres gets it in six batches, and the six
 * have to look like each other as well as like the standard. Those are not the
 * same requirement. Six batches each half a unit off the standard in six
 * different directions are all inside tolerance and the garment made from two
 * of them is a reject.
 *
 * So an order carries a second, tighter tolerance that is judged batch against
 * batch, and the reference every batch is compared to is the first approved one
 * rather than the standard.
 */

import {
  FieldError,
  requireArray,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';
import { meanLab } from '../colour/lab.js';
import { deltaE } from '../colour/deltae.js';

export function makeOrder(input) {
  const id = requireText(input.id, 'order.id', { maxLength: 24 });
  const customer = requireText(input.customer, 'order.customer', { maxLength: 80 });
  const standard = input.standard;
  if (!standard || typeof standard.L !== 'number') {
    throw new FieldError('order.standard', 'must be a lab reading', standard);
  }
  const tolerance = input.tolerance;
  if (!tolerance || typeof tolerance.total !== 'number') {
    throw new FieldError('order.tolerance', 'must be a tolerance block', tolerance);
  }
  const continuityLimit = optional(
    input.continuityLimit,
    (v) => requirePositive(v, 'order.continuityLimit'),
    tolerance.total * 0.6
  );
  if (continuityLimit > tolerance.total) {
    throw new FieldError(
      'order.continuityLimit',
      'must be tighter than the tolerance against the standard',
      continuityLimit
    );
  }
  return {
    id,
    customer,
    standard,
    tolerance,
    continuityLimit,
    batches: [],
    reference: null,
  };
}

/**
 * Add a batch reading. The first batch accepted against the standard becomes the
 * reference for everything after it, and stays the reference even if a later
 * batch sits closer to the standard, because the goods already shipped cannot
 * be recalled to match a better one.
 */
export function recordBatch(order, entry) {
  const batchId = requireText(entry.batchId, 'batch.batchId', { maxLength: 24 });
  const reading = entry.reading;
  if (!reading || typeof reading.L !== 'number') {
    throw new FieldError('batch.reading', 'must be a lab reading', reading);
  }
  if (order.batches.some((existing) => existing.batchId === batchId)) {
    throw new FieldError('batch.batchId', 'is already on this order', batchId);
  }
  const formula = order.tolerance.formula;
  const againstStandard = deltaE(formula, order.standard, reading, order.tolerance.options);
  const againstReference =
    order.reference === null
      ? null
      : deltaE(formula, order.reference.reading, reading, order.tolerance.options);

  const withinStandard = againstStandard <= order.tolerance.total;
  const withinContinuity = againstReference === null || againstReference <= order.continuityLimit;

  const record = Object.freeze({
    batchId,
    reading,
    againstStandard,
    againstReference,
    withinStandard,
    withinContinuity,
    accepted: withinStandard && withinContinuity,
  });
  order.batches.push(record);
  if (order.reference === null && record.accepted) {
    order.reference = record;
  }
  return record;
}

/** The spread of everything accepted so far, which is what a shade band report shows. */
export function shadeBand(order) {
  const accepted = order.batches.filter((batch) => batch.accepted);
  requireArray(accepted, 'accepted batches', { min: 1 });
  const readings = accepted.map((batch) => batch.reading);
  const centre = meanLab(readings);
  const spread = readings.map((reading) =>
    deltaE(order.tolerance.formula, centre, reading, order.tolerance.options)
  );
  return {
    count: accepted.length,
    centre,
    widest: Math.max(...spread),
    mean: spread.reduce((a, b) => a + b, 0) / spread.length,
  };
}

export function rejectedBatches(order) {
  return order.batches.filter((batch) => !batch.accepted);
}

/** Right first time, on the batches this order has produced. */
export function rightFirstTime(order) {
  if (order.batches.length === 0) return null;
  return order.batches.filter((batch) => batch.accepted).length / order.batches.length;
}

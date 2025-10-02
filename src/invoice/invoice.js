/**
 * Invoicing a commission dyeing.
 *
 * The customer is charged per kilogram of cloth returned, at a rate that
 * depends on the shade band, with surcharges for the things that genuinely cost
 * more. It has to be arguable line by line, because the customer never sees the
 * batch and will query anything they cannot reconstruct from the note.
 *
 * Seconds are charged at a reduced rate rather than not at all. Free seconds
 * are how a dyehouse ends up doing the reworking for nothing.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';
import { bandNames } from '../recipe/depth.js';

export const SURCHARGES = Object.freeze([
  'small-lot',
  'rush',
  'special-finish',
  're-dye',
  'sampling',
]);

export function makeRateCard(input) {
  const perBand = {};
  for (const band of bandNames()) {
    perBand[band] = requirePositive(input.perBand?.[band], `rateCard.perBand.${band}`);
  }
  const surcharges = {};
  for (const name of SURCHARGES) {
    surcharges[name] = optional(
      input.surcharges?.[name],
      (v) => requirePositive(v, `rateCard.surcharges.${name}`),
      0
    );
  }
  return Object.freeze({
    name: requireText(input.name, 'rateCard.name', { maxLength: 60 }),
    perBand: Object.freeze(perBand),
    surcharges: Object.freeze(surcharges),
    secondsRate: requireInRange(
      optional(input.secondsRate, Number, 0.5),
      'rateCard.secondsRate',
      0,
      1
    ),
    minimumLotKg: optional(
      input.minimumLotKg,
      (v) => requirePositive(v, 'rateCard.minimumLotKg'),
      50
    ),
    minimumCharge: optional(
      input.minimumCharge,
      (v) => requirePositive(v, 'rateCard.minimumCharge'),
      0
    ),
  });
}

function surchargeLines(rateCard, applied) {
  return applied.map((name) => {
    requireOneOf(name, 'surcharge', SURCHARGES);
    const rate = rateCard.surcharges[name];
    if (rate === 0) {
      throw new FieldError('surcharge', `${name} is not priced on this rate card`, name);
    }
    return { kind: 'surcharge', name, rate };
  });
}

/**
 * One batch as it appears on an invoice. Firsts and seconds are separate lines
 * because they are charged at different rates and because the customer needs to
 * see the split without asking.
 */
export function invoiceBatch(rateCard, batch) {
  const band = requireOneOf(batch.band, 'batch.band', bandNames());
  const firstsKg = optional(batch.firstsKg, (v) => requirePositive(v, 'batch.firstsKg'), 0);
  const secondsKg = optional(batch.secondsKg, (v) => requirePositive(v, 'batch.secondsKg'), 0);
  if (firstsKg + secondsKg === 0) {
    throw new FieldError('batch', 'has no cloth on it at all', batch.id);
  }
  const rate = rateCard.perBand[band];
  const surcharges = surchargeLines(rateCard, batch.surcharges ?? []);
  const surchargeRate = surcharges.reduce((sum, line) => sum + line.rate, 0);

  const lines = [];
  if (firstsKg > 0) {
    lines.push({ kind: 'firsts', kg: firstsKg, rate: rate + surchargeRate, band });
  }
  if (secondsKg > 0) {
    lines.push({
      kind: 'seconds',
      kg: secondsKg,
      rate: (rate + surchargeRate) * rateCard.secondsRate,
      band,
    });
  }
  const value = lines.reduce((sum, line) => sum + line.kg * line.rate, 0);
  return {
    batchId: requireText(batch.id, 'batch.id', { maxLength: 24 }),
    band,
    lines,
    surcharges,
    kg: firstsKg + secondsKg,
    value: Math.max(value, rateCard.minimumCharge),
    atMinimum: value < rateCard.minimumCharge,
  };
}

export function invoiceOrder(rateCard, { number, customer, batches }) {
  requireArray(batches, 'batches', { min: 1 });
  const rows = batches.map((batch) => invoiceBatch(rateCard, batch));
  const net = rows.reduce((sum, row) => sum + row.value, 0);
  return {
    number: requireText(number, 'number', { maxLength: 24 }),
    customer: requireText(customer, 'customer', { maxLength: 80 }),
    rateCard: rateCard.name,
    batches: rows,
    kg: rows.reduce((sum, row) => sum + row.kg, 0),
    net,
  };
}

/** Whether a lot is small enough that the small lot surcharge is fair. */
export function isSmallLot(rateCard, kg) {
  requirePositive(kg, 'kg');
  return kg < rateCard.minimumLotKg;
}

/**
 * Dyestuff and chemical stock.
 *
 * Stock is held in lots because a dye lot is not fungible with the next one: two
 * lots of the same article can differ by a couple of percent in strength, which
 * is enough to move a critical shade. So an issue names a lot, and the default
 * is oldest first rather than cheapest first.
 *
 * Nothing here averages a cost. Each lot carries what it was bought at and an
 * issue is costed at the lot it came from.
 */

import {
  FieldError,
  requireNonNegative,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export function createStock() {
  return { lots: [], movements: [] };
}

export function receiveLot(stock, input) {
  const lotId = requireText(input.lotId, 'lot.lotId', { maxLength: 32 });
  if (stock.lots.some((lot) => lot.lotId === lotId)) {
    throw new FieldError('lot.lotId', 'is already in stock', lotId);
  }
  const lot = {
    lotId,
    code: requireText(input.code, 'lot.code', { maxLength: 32 }),
    quantityKg: requirePositive(input.quantityKg, 'lot.quantityKg'),
    pricePerKg: requirePositive(input.pricePerKg, 'lot.pricePerKg'),
    receivedAt: optional(input.receivedAt, (v) => requireText(v, 'lot.receivedAt'), null),
    strength: optional(input.strength, (v) => requirePositive(v, 'lot.strength'), 100),
    remainingKg: requirePositive(input.quantityKg, 'lot.quantityKg'),
  };
  stock.lots.push(lot);
  stock.movements.push({
    kind: 'receipt',
    lotId,
    code: lot.code,
    kg: lot.quantityKg,
    at: lot.receivedAt,
  });
  return lot;
}

export function onHand(stock, code) {
  return stock.lots
    .filter((lot) => lot.code === code && lot.remainingKg > 0)
    .reduce((sum, lot) => sum + lot.remainingKg, 0);
}

export function lotsFor(stock, code, { order = 'oldest' } = {}) {
  const open = stock.lots.filter((lot) => lot.code === code && lot.remainingKg > 0);
  if (order === 'cheapest') {
    return [...open].sort((a, b) => a.pricePerKg - b.pricePerKg);
  }
  if (order === 'oldest') {
    return open;
  }
  throw new FieldError('order', 'must be oldest or cheapest', order);
}

/**
 * Issue against a code, drawing from as many lots as it takes. An issue that
 * cannot be filled draws nothing at all, because a half filled dispense is worse
 * than a refused one.
 */
export function issue(stock, code, kg, { order = 'oldest', batchId = null } = {}) {
  requirePositive(kg, 'kg');
  const available = onHand(stock, code);
  if (available < kg) {
    throw new FieldError(
      'kg',
      `is more than the ${available.toFixed(3)} kg on hand for ${code}`,
      kg
    );
  }
  const drawn = [];
  let outstanding = kg;
  for (const lot of lotsFor(stock, code, { order })) {
    if (outstanding <= 0) break;
    const take = Math.min(lot.remainingKg, outstanding);
    lot.remainingKg -= take;
    outstanding -= take;
    drawn.push({ lotId: lot.lotId, kg: take, pricePerKg: lot.pricePerKg, strength: lot.strength });
  }
  const cost = drawn.reduce((sum, line) => sum + line.kg * line.pricePerKg, 0);
  stock.movements.push({ kind: 'issue', code, kg, batchId, drawn, cost });
  return { code, kg, drawn, cost, batchId };
}

/** Put an unused dispense back, which happens when a batch is cancelled at the machine. */
export function returnToStock(stock, lotId, kg) {
  requirePositive(kg, 'kg');
  const lot = stock.lots.find((candidate) => candidate.lotId === lotId);
  if (!lot) {
    throw new FieldError('lotId', 'is not in stock', lotId);
  }
  if (lot.remainingKg + kg > lot.quantityKg) {
    throw new FieldError('kg', 'would put more back than was ever issued', kg);
  }
  lot.remainingKg += kg;
  stock.movements.push({ kind: 'return', lotId, code: lot.code, kg });
  return lot;
}

export function valueOnHand(stock, code) {
  return stock.lots
    .filter((lot) => (code === undefined || lot.code === code) && lot.remainingKg > 0)
    .reduce((sum, lot) => sum + lot.remainingKg * lot.pricePerKg, 0);
}

/** Codes that have fallen below their reorder point. */
export function belowReorder(stock, reorderPoints) {
  const short = [];
  for (const [code, point] of Object.entries(reorderPoints)) {
    requireNonNegative(point, `reorderPoints.${code}`);
    const held = onHand(stock, code);
    if (held < point) {
      short.push({ code, onHand: held, reorderPoint: point, shortBy: point - held });
    }
  }
  return short.sort((a, b) => b.shortBy - a.shortBy);
}

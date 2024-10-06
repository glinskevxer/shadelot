/**
 * The month.
 *
 * Four numbers get argued about at the end of every month and this works them
 * out the same way every time: right first time, cost per saleable kilogram,
 * water per kilogram, and machine utilisation. Nothing here is a target, and
 * nothing is compared to last month automatically, because a month with a shut
 * week in it is not comparable to one without and the report should not pretend.
 */

import { FieldError, requireArray, requirePositive, optional } from '../valid/guards.js';

export function summariseMonth(batches, { machineHoursAvailable, month } = {}) {
  requireArray(batches, 'batches', { min: 1 });
  const totals = batches.reduce(
    (sum, batch) => {
      const saleable = batch.saleableKg ?? batch.fibreKg;
      return {
        batches: sum.batches + 1,
        firstTime: sum.firstTime + (batch.accepted && batch.passes === 1 ? 1 : 0),
        accepted: sum.accepted + (batch.accepted ? 1 : 0),
        fibreKg: sum.fibreKg + batch.fibreKg,
        saleableKg: sum.saleableKg + saleable,
        cost: sum.cost + batch.cost,
        waterLitres: sum.waterLitres + batch.waterLitres,
        machineMinutes: sum.machineMinutes + batch.machineMinutes,
        passes: sum.passes + batch.passes,
      };
    },
    {
      batches: 0,
      firstTime: 0,
      accepted: 0,
      fibreKg: 0,
      saleableKg: 0,
      cost: 0,
      waterLitres: 0,
      machineMinutes: 0,
      passes: 0,
    }
  );

  const hours = totals.machineMinutes / 60;
  return {
    month: optional(month, String, null),
    ...totals,
    rightFirstTime: totals.firstTime / totals.batches,
    acceptedRate: totals.accepted / totals.batches,
    passesPerBatch: totals.passes / totals.batches,
    costPerSaleableKg: totals.saleableKg === 0 ? null : totals.cost / totals.saleableKg,
    litresPerKg: totals.saleableKg === 0 ? null : totals.waterLitres / totals.saleableKg,
    machineHours: hours,
    utilisation:
      machineHoursAvailable === undefined
        ? null
        : hours / requirePositive(machineHoursAvailable, 'machineHoursAvailable'),
  };
}

/**
 * Split a month by a key, so the same four numbers can be read per machine, per
 * customer or per shade band without three more functions.
 */
export function splitBy(batches, key, options = {}) {
  requireArray(batches, 'batches', { min: 1 });
  const groups = new Map();
  for (const batch of batches) {
    const value = batch[key];
    if (value === undefined) {
      throw new FieldError('key', `is not on every batch, ${batch.id} has no ${key}`, key);
    }
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(batch);
  }
  return [...groups.entries()]
    .map(([value, members]) => ({ [key]: value, ...summariseMonth(members, options) }))
    .sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

/** The batches that cost most per saleable kilogram, which is where to look first. */
export function worstCost(batches, { limit = 5 } = {}) {
  requirePositive(limit, 'limit');
  return [...batches]
    .filter((batch) => (batch.saleableKg ?? batch.fibreKg) > 0)
    .map((batch) => ({
      id: batch.id,
      perKg: batch.cost / (batch.saleableKg ?? batch.fibreKg),
      passes: batch.passes,
      accepted: batch.accepted,
    }))
    .sort((a, b) => b.perKg - a.perKg)
    .slice(0, limit);
}

/** What the reworking cost, which is the number nobody wants to publish. */
export function reworkCost(batches) {
  const extraPasses = batches.reduce((sum, batch) => sum + Math.max(0, batch.passes - 1), 0);
  const total = batches.reduce((sum, batch) => sum + batch.cost, 0);
  const passes = batches.reduce((sum, batch) => sum + batch.passes, 0);
  if (passes === 0) return { extraPasses: 0, cost: 0, share: 0 };
  const perPass = total / passes;
  return { extraPasses, cost: extraPasses * perPass, share: extraPasses / passes };
}

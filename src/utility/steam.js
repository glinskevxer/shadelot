/**
 * The boiler house.
 *
 * Steam is metered at the boiler and used everywhere, so the per batch numbers
 * the energy module produces have to be reconciled against what the boiler
 * actually made. They never agree, and the gap is real: distribution losses,
 * the drying range, the canteen, and a trap that has been blowing through since
 * March.
 *
 * The reconciliation is worth doing because the size of the gap is the only
 * warning the works gets that something is wrong in the pipework.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requirePositive,
  optional,
} from '../valid/guards.js';

/** Kilojoules per kilogram of saturated steam at works pressure, near enough. */
export const ENTHALPY_KJ_PER_KG = 2200;

export function steamFromHeat(kilojoules) {
  requirePositive(kilojoules, 'kilojoules');
  return kilojoules / ENTHALPY_KJ_PER_KG;
}

export function heatFromSteam(kilograms) {
  requirePositive(kilograms, 'kilograms');
  return kilograms * ENTHALPY_KJ_PER_KG;
}

/**
 * Fuel for a quantity of steam, at a measured boiler efficiency. The efficiency
 * is a works measurement and it falls over a year, which is the whole reason
 * this is a parameter rather than a constant.
 */
export function fuelForSteam(steamKg, { efficiency = 0.82, calorificValue = 38000 } = {}) {
  requirePositive(steamKg, 'steamKg');
  requireInRange(efficiency, 'efficiency', 0.3, 1);
  requirePositive(calorificValue, 'calorificValue');
  return (steamKg * ENTHALPY_KJ_PER_KG) / (efficiency * calorificValue);
}

/**
 * Reconcile a day. The batches account for what they account for and everything
 * else is named rather than absorbed, because an unnamed gap is a gap nobody
 * looks at.
 */
export function reconcileDay({ boilerSteamKg, batches, otherUses = [] }) {
  requirePositive(boilerSteamKg, 'boilerSteamKg');
  requireArray(batches, 'batches');
  const batchSteam = batches.reduce(
    (sum, batch) => sum + requirePositive(batch.steamKg, 'batch.steamKg'),
    0
  );
  const other = otherUses.reduce((sum, use) => {
    requirePositive(use.steamKg, 'use.steamKg');
    return sum + use.steamKg;
  }, 0);
  const unaccounted = boilerSteamKg - batchSteam - other;
  return {
    boilerSteamKg,
    batchSteamKg: batchSteam,
    otherSteamKg: other,
    unaccountedKg: unaccounted,
    unaccountedShare: unaccounted / boilerSteamKg,
    batches: batches.length,
  };
}

/** What the works thinks a normal gap looks like, and whether this day is one. */
export const NORMAL_LOSS = 0.12;

export function assessLosses(reconciliation, { normal = NORMAL_LOSS, alarm = 0.25 } = {}) {
  requireInRange(normal, 'normal', 0, 1);
  requireInRange(alarm, 'alarm', 0, 1);
  if (alarm <= normal) {
    throw new FieldError('alarm', 'must sit above the normal loss', alarm);
  }
  const share = reconciliation.unaccountedShare;
  if (share < 0) {
    return {
      state: 'impossible',
      share,
      note: 'the batches claim more steam than the boiler made',
    };
  }
  if (share <= normal) return { state: 'normal', share, note: 'distribution losses look ordinary' };
  if (share <= alarm) return { state: 'high', share, note: 'worth walking the traps' };
  return { state: 'alarm', share, note: 'something is blowing through, find it today' };
}

/**
 * Allocate the unaccounted steam back over the batches, which is what the
 * costing does at month end so the batches add up to the bill.
 */
export function allocateLosses(reconciliation, batches, { by = 'steam' } = {}) {
  const gap = Math.max(0, reconciliation.unaccountedKg);
  const weight = (batch) => (by === 'steam' ? batch.steamKg : optional(batch.fibreKg, Number, 1));
  const total = batches.reduce((sum, batch) => sum + weight(batch), 0);
  requirePositive(total, 'allocation weight');
  return batches.map((batch) => ({
    id: batch.id,
    steamKg: batch.steamKg,
    allocatedKg: (weight(batch) / total) * gap,
    chargedKg: batch.steamKg + (weight(batch) / total) * gap,
  }));
}

/**
 * Heat recovery.
 *
 * A dye bath is dropped at sixty degrees and the next one is filled cold, which
 * is the single largest avoidable loss in the building. A plate exchanger on the
 * drain recovers some of it into the incoming water, and how much depends on the
 * exchanger, on how close together the drop and the fill are, and on whether
 * there is a tank to hold the hot water in between.
 *
 * Without a tank the two have to overlap, and on a floor where they usually do
 * not the exchanger recovers almost nothing however good it is.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requirePositive,
  optional,
} from '../valid/guards.js';
import { SPECIFIC_HEAT_WATER, KJ_PER_KWH } from './energy.js';

export function makeExchanger(input) {
  return Object.freeze({
    id: input.id,
    effectiveness: requireInRange(input.effectiveness, 'exchanger.effectiveness', 0.05, 0.95),
    maxLitresPerMinute: requirePositive(input.maxLitresPerMinute, 'exchanger.maxLitresPerMinute'),
    tankLitres: optional(input.tankLitres, (v) => requirePositive(v, 'exchanger.tankLitres'), 0),
    coldInletC: requireInRange(
      optional(input.coldInletC, Number, 12),
      'exchanger.coldInletC',
      0,
      40
    ),
  });
}

/**
 * How much of a drop can be caught. Without a tank only the part of the drop
 * that overlaps a fill is any use; with one, the tank caps what can be held.
 */
export function catchable(exchanger, { dropLitres, overlapLitres }) {
  requirePositive(dropLitres, 'dropLitres');
  const overlap = optional(
    overlapLitres,
    (v) => requireInRange(v, 'overlapLitres', 0, dropLitres),
    0
  );
  if (exchanger.tankLitres === 0) {
    return overlap;
  }
  return Math.min(dropLitres, Math.max(overlap, exchanger.tankLitres));
}

/** The heat an exchanger recovers from one drop, in kilojoules. */
export function recovered(exchanger, { dropLitres, dropTemperature, overlapLitres }) {
  requireInRange(dropTemperature, 'dropTemperature', 0, 145);
  const litres = catchable(exchanger, { dropLitres, overlapLitres });
  if (litres === 0) return 0;
  const rise = Math.max(0, dropTemperature - exchanger.coldInletC) * exchanger.effectiveness;
  return litres * SPECIFIC_HEAT_WATER * rise;
}

/** The same, as the temperature the incoming water arrives at. */
export function preheatedTo(exchanger, dropTemperature) {
  requireInRange(dropTemperature, 'dropTemperature', 0, 145);
  const rise = Math.max(0, dropTemperature - exchanger.coldInletC) * exchanger.effectiveness;
  return exchanger.coldInletC + rise;
}

/**
 * A day of drops. Nothing here assumes the drops and the fills line up, because
 * on most floors they do not and the recovery that gets quoted in a proposal is
 * the one that assumes they do.
 */
export function recoverDay(exchanger, drops) {
  requireArray(drops, 'drops', { min: 1 });
  const rows = drops.map((drop) => ({
    batchId: drop.batchId,
    dropLitres: drop.dropLitres,
    caught: catchable(exchanger, drop),
    heatKj: recovered(exchanger, drop),
  }));
  const heat = rows.reduce((sum, row) => sum + row.heatKj, 0);
  const dropped = drops.reduce((sum, drop) => sum + drop.dropLitres, 0);
  return {
    rows,
    heatKj: heat,
    heatKwh: heat / KJ_PER_KWH,
    litresDropped: dropped,
    litresCaught: rows.reduce((sum, row) => sum + row.caught, 0),
    caughtShare: rows.reduce((sum, row) => sum + row.caught, 0) / dropped,
  };
}

/**
 * Whether an exchanger pays for itself, at the works steam price. Payback is in
 * years because that is the unit the decision is made in.
 */
export function payback(day, { capitalCost, steamPerTonne, daysPerYear = 250, enthalpy = 2200 }) {
  requirePositive(capitalCost, 'capitalCost');
  requirePositive(steamPerTonne, 'steamPerTonne');
  requirePositive(daysPerYear, 'daysPerYear');
  const steamKgPerDay = day.heatKj / enthalpy;
  const savingPerYear = (steamKgPerDay / 1000) * steamPerTonne * daysPerYear;
  if (savingPerYear <= 0) {
    throw new FieldError('day', 'recovers nothing, so nothing pays back', day.heatKj);
  }
  return { savingPerYear, years: capitalCost / savingPerYear, steamKgPerDay };
}

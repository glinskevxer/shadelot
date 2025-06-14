/**
 * Filling the machines.
 *
 * A day's lots have to go onto the machines that are free, and the objective is
 * not the obvious one. Filling every machine to its maximum gives the best fill
 * factor and the worst liquor ratios, because a machine at its maximum runs
 * tight and one at its minimum runs long, and both cost shade.
 *
 * So the score is a compromise: fill factor matters, and so does how close the
 * ratio lands to what the recipe wanted. The weighting is a works decision and
 * it is a parameter rather than a constant for exactly that reason.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requirePositive,
  optional,
} from '../valid/guards.js';
import { liquorRatioAt } from './register.js';

export const DEFAULT_WEIGHTS = Object.freeze({ fill: 0.4, ratio: 0.6 });

/**
 * Score one load on one machine, nought to one. A load that does not fit scores
 * nothing rather than a negative, because a negative invites a comparison
 * between two impossible plans.
 */
export function scoreLoad(machine, fibreKg, wantedRatio, { weights = DEFAULT_WEIGHTS } = {}) {
  requirePositive(fibreKg, 'fibreKg');
  requirePositive(wantedRatio, 'wantedRatio');
  requireInRange(weights.fill + weights.ratio, 'weights', 0.999, 1.001);
  if (fibreKg < machine.minLoadKg || fibreKg > machine.maxLoadKg) {
    return { score: 0, fill: 0, ratioMiss: null, fits: false };
  }
  const fill = fibreKg / machine.maxLoadKg;
  const actual = liquorRatioAt(machine, fibreKg);
  const miss = Math.abs(actual - wantedRatio) / wantedRatio;
  const ratioScore = 1 / (1 + miss * 3);
  return {
    score: weights.fill * fill + weights.ratio * ratioScore,
    fill,
    ratio: actual,
    ratioMiss: miss,
    fits: true,
  };
}

/** The best machine for a load, or nothing when none of them will take it. */
export function bestMachine(machines, fibreKg, wantedRatio, options = {}) {
  const scored = [...machines]
    .map((machine) => ({ machine, ...scoreLoad(machine, fibreKg, wantedRatio, options) }))
    .filter((row) => row.fits)
    .sort((a, b) => b.score - a.score || a.machine.id.localeCompare(b.machine.id));
  return scored[0] ?? null;
}

/**
 * Assign a day of lots to machines. Lots are taken heaviest first, because a
 * heavy lot has fewer machines that will take it and leaving it to last is how
 * a plan ends with one lot and nowhere to put it.
 */
export function assign(lots, machines, { wantedRatio = 8, weights = DEFAULT_WEIGHTS } = {}) {
  requireArray(lots, 'lots', { min: 1 });
  requireArray(machines, 'machines', { min: 1 });
  const free = new Map(machines.map((machine) => [machine.id, machine]));
  const placed = [];
  const unplaced = [];

  for (const lot of [...lots].sort((a, b) => b.mass - a.mass)) {
    const choice = bestMachine([...free.values()], lot.mass, wantedRatio, { weights });
    if (choice === null) {
      unplaced.push({ lotId: lot.id, mass: lot.mass, reason: reasonFor(machines, lot.mass) });
      continue;
    }
    free.delete(choice.machine.id);
    placed.push({
      lotId: lot.id,
      machineId: choice.machine.id,
      mass: lot.mass,
      fill: choice.fill,
      ratio: choice.ratio,
      ratioMiss: choice.ratioMiss,
      score: choice.score,
    });
  }

  return {
    placed,
    unplaced,
    idle: [...free.keys()].sort(),
    meanFill:
      placed.length === 0 ? 0 : placed.reduce((sum, row) => sum + row.fill, 0) / placed.length,
    worstRatioMiss: placed.length === 0 ? 0 : Math.max(...placed.map((row) => row.ratioMiss)),
  };
}

function reasonFor(machines, mass) {
  const smallest = Math.min(...machines.map((machine) => machine.minLoadKg));
  const largest = Math.max(...machines.map((machine) => machine.maxLoadKg));
  if (mass < smallest) return `at ${mass.toFixed(1)} kg it is under every machine minimum`;
  if (mass > largest) return `at ${mass.toFixed(1)} kg it is over every machine maximum`;
  return 'every machine that would take it was already committed';
}

/**
 * Split a lot that is too big for anything into loads that will fit. The pieces
 * come back as even as possible, because two even loads dye more alike than a
 * full one and a nearly empty one.
 */
export function splitLot(lot, machine) {
  requirePositive(lot.mass, 'lot.mass');
  const pieces = Math.ceil(lot.mass / machine.maxLoadKg);
  if (pieces <= 1) return [{ id: lot.id, mass: lot.mass }];
  const each = lot.mass / pieces;
  if (each < machine.minLoadKg) {
    throw new FieldError(
      'lot.mass',
      `splits into ${pieces} loads of ${each.toFixed(1)} kg, under the ${machine.minLoadKg} minimum`,
      lot.mass
    );
  }
  return Array.from({ length: pieces }, (_, index) => ({
    id: `${lot.id}-${index + 1}`,
    mass: optional(each, Number, each),
  }));
}

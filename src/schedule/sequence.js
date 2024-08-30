/**
 * Shade sequencing.
 *
 * A machine that has just run a black and is asked to run a pale beige needs a
 * cleaning cycle in between, and the cycle costs an hour of machine time and a
 * bath of water. Running the day light to dark avoids most of them. That is the
 * whole idea and it is older than anybody working here.
 *
 * What makes it more than a sort is that the order is constrained: a batch with
 * a delivery date cannot wait behind six paler ones, and a machine changing
 * dye class needs a cycle whichever direction the shade goes.
 */

import { requireArray, requireNonNegative, requirePositive, optional } from '../valid/guards.js';

export const CLEAN_MINUTES = Object.freeze({ none: 0, rinse: 20, boil: 60, strip: 120 });

/**
 * The cleaning a changeover needs. Going darker needs nothing, going lighter
 * needs a cycle whose length depends on how far, and changing class always needs
 * a boil whichever way the depth moves.
 */
export function changeover(previous, next) {
  if (previous === null)
    return { clean: 'rinse', minutes: CLEAN_MINUTES.rinse, reason: 'first batch of the run' };
  if (previous.dyeClass !== next.dyeClass) {
    return { clean: 'boil', minutes: CLEAN_MINUTES.boil, reason: 'the dye class changes' };
  }
  const drop = previous.depth - next.depth;
  if (drop <= 0) {
    return { clean: 'none', minutes: 0, reason: 'the shade goes darker or stays' };
  }
  if (drop >= 3) {
    return {
      clean: 'strip',
      minutes: CLEAN_MINUTES.strip,
      reason: 'a heavy shade before a pale one',
    };
  }
  if (drop >= 1) {
    return {
      clean: 'boil',
      minutes: CLEAN_MINUTES.boil,
      reason: 'the shade goes lighter by a band or more',
    };
  }
  return {
    clean: 'rinse',
    minutes: CLEAN_MINUTES.rinse,
    reason: 'the shade goes slightly lighter',
  };
}

/** The cleaning cost of a whole order, in minutes. */
export function sequenceCost(batches) {
  requireArray(batches, 'batches');
  let previous = null;
  let minutes = 0;
  const steps = [];
  for (const batch of batches) {
    const step = changeover(previous, batch);
    minutes += step.minutes + (batch.runMinutes ?? 0);
    steps.push({ batchId: batch.id, ...step });
    previous = batch;
  }
  return { minutes, steps };
}

/**
 * Order a day's work. Batches are sorted light to dark inside their dye class,
 * and anything whose due date falls inside the urgent window is pulled to the
 * front of its class regardless of depth.
 */
export function sequenceDay(batches, { urgentBefore = null } = {}) {
  requireArray(batches, 'batches');
  const urgency = (batch) => {
    if (urgentBefore === null || !batch.dueAt) return 1;
    return batch.dueAt <= urgentBefore ? 0 : 1;
  };
  return [...batches].sort(
    (a, b) =>
      String(a.dyeClass).localeCompare(String(b.dyeClass)) ||
      urgency(a) - urgency(b) ||
      a.depth - b.depth ||
      String(a.id).localeCompare(String(b.id))
  );
}

/** What the sequencing saved against running the batches in the order they arrived. */
export function sequencingSaving(batches, options) {
  const asGiven = sequenceCost(batches);
  const sequenced = sequenceCost(sequenceDay(batches, options));
  return {
    asGivenMinutes: asGiven.minutes,
    sequencedMinutes: sequenced.minutes,
    savedMinutes: asGiven.minutes - sequenced.minutes,
    order: sequenced.steps.map((step) => step.batchId),
  };
}

/** Machine hours a day of work needs, cleaning included. */
export function dayLoad(batches, { hoursAvailable = 24 } = {}) {
  requirePositive(hoursAvailable, 'hoursAvailable');
  const { minutes } = sequenceCost(sequenceDay(batches));
  const hours = minutes / 60;
  return {
    hours,
    hoursAvailable,
    utilisation: hours / hoursAvailable,
    overrun: Math.max(0, hours - hoursAvailable),
  };
}

export function depthOf(recipe) {
  return requireNonNegative(optional(recipe.totalOwf, Number, 0), 'totalOwf');
}

/**
 * Treating the effluent.
 *
 * The consent is a limit on what leaves; the plant is what gets it under the
 * limit. Three things are done here and they do not do the same job:
 * neutralising fixes the pH and nothing else, coagulation drops the colour and
 * some of the demand with it, and biological treatment takes the demand down
 * and does almost nothing to the colour.
 *
 * A works that buys the wrong one has bought a large tank that fixes the wrong
 * number, which is why this reads what is actually over the limit before it
 * suggests anything.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requirePositive,
  optional,
} from '../valid/guards.js';
import { LIMITS, checkConsent } from './load.js';

export const STAGES = ['neutralise', 'coagulate', 'biological', 'polish'];

/** What each stage takes off, as a share, measured on this works' own plant. */
export const REMOVAL = Object.freeze({
  neutralise: { cod: 0.02, colour: 0.05, tds: 0 },
  coagulate: { cod: 0.35, colour: 0.8, tds: -0.1 },
  biological: { cod: 0.75, colour: 0.15, tds: 0 },
  polish: { cod: 0.4, colour: 0.55, tds: 0 },
});

/** Roughly what each stage costs to run, per cubic metre. */
export const COST_PER_M3 = Object.freeze({
  neutralise: 0.12,
  coagulate: 0.48,
  biological: 0.31,
  polish: 0.74,
});

export function stageFor(name) {
  const stage = REMOVAL[name];
  if (!stage) {
    throw new FieldError('stage', `must be one of ${STAGES.join(', ')}`, name);
  }
  return stage;
}

/** Put a day through a train of stages and say what comes out. */
export function treat(day, stages) {
  requireArray(stages, 'stages');
  let current = { ...day };
  const steps = [];
  for (const name of stages) {
    const stage = stageFor(name);
    const before = { ...current };
    current = {
      ...current,
      codKg: current.codKg * (1 - stage.cod),
      colourUnits: current.colourUnits * (1 - stage.colour),
      tdsKg: current.tdsKg * (1 - stage.tds),
    };
    steps.push({ stage: name, before, after: { ...current } });
  }
  return { out: current, steps };
}

export function runningCost(day, stages, { perM3 = COST_PER_M3 } = {}) {
  requirePositive(day.volumeM3, 'day.volumeM3');
  return stages.reduce((sum, name) => {
    stageFor(name);
    const rate = perM3[name];
    if (typeof rate !== 'number') {
      throw new FieldError('perM3', `carries no price for ${name}`, name);
    }
    return sum + rate * day.volumeM3;
  }, 0);
}

/**
 * The cheapest train that gets a day inside the consent. Trains are tried in
 * order of cost and the first that works is taken, because a plant that
 * over-treats costs money every day for the rest of its life.
 */
export function prescribe(consent, day, { perM3 = COST_PER_M3, ph } = {}) {
  const failing = checkConsent(consent, day, { ph }).breaches.map((breach) => breach.parameter);
  if (failing.length === 0) {
    return { stages: [], cost: 0, reason: 'the day is already inside the consent' };
  }
  if (failing.includes('volume')) {
    return {
      stages: [],
      cost: 0,
      reason: 'the volume is over, and no treatment makes water disappear',
    };
  }

  const trains = [
    ['neutralise'],
    ['coagulate'],
    ['biological'],
    ['neutralise', 'coagulate'],
    ['coagulate', 'biological'],
    ['neutralise', 'coagulate', 'biological'],
    ['neutralise', 'coagulate', 'biological', 'polish'],
  ];
  const priced = trains
    .map((stages) => ({ stages, cost: runningCost(day, stages, { perM3 }) }))
    .sort((a, b) => a.cost - b.cost);

  for (const candidate of priced) {
    const treated = treat(day, candidate.stages).out;
    const stillFailing = checkConsent(consent, treated).breaches;
    const phFixed = !failing.includes('ph') || candidate.stages.includes('neutralise');
    if (stillFailing.length === 0 && phFixed) {
      return { ...candidate, reason: `it brings ${failing.join(' and ')} inside the consent` };
    }
  }
  return {
    stages: priced.at(-1).stages,
    cost: priced.at(-1).cost,
    reason: 'no train this works can run gets the day inside, the load has to come down instead',
    insufficient: true,
  };
}

/** How much a day would have to fall by to need no treatment at all. */
export function reductionNeeded(consent, day) {
  const out = {};
  for (const entry of LIMITS) {
    const limit = consent[entry.consentKey];
    const value = day[entry.dayKey];
    out[entry.parameter] = value <= limit ? 0 : 1 - limit / value;
  }
  return out;
}

/** Sludge from a coagulation, which is the cost nobody puts in the proposal. */
export function sludgeKg(day, stages, { perColourUnit = 0.0006 } = {}) {
  requireInRange(perColourUnit, 'perColourUnit', 0, 1);
  if (!stages.includes('coagulate')) return 0;
  const removed = day.colourUnits * REMOVAL.coagulate.colour;
  return removed * optional(day.volumeM3, Number, 1) * perColourUnit * 1000;
}

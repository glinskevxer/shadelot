/**
 * Beams and barre.
 *
 * Barre is a bar of a different shade running across the cloth, and it is
 * almost never a dyeing fault. It comes from the weaving: two warp beams, or
 * one beam and a new cone of weft, taking dye differently because the yarn came
 * from different spinning lots.
 *
 * A dyehouse that cannot show where it came from pays for it. So the beam and
 * the yarn lot are carried on the roll, and a lot mixing two of either is
 * flagged before it goes in rather than argued about after.
 */

import { FieldError, requireArray, requireText, optional } from '../valid/guards.js';

export function beamOf(roll) {
  return optional(roll.beam, (v) => requireText(v, 'roll.beam', { maxLength: 32 }), null);
}

export function yarnLotsOf(roll) {
  const lots = optional(roll.yarnLots, (v) => requireArray(v, 'roll.yarnLots'), []);
  return lots.map((lot) => requireText(lot, 'roll.yarnLots[]', { maxLength: 32 }));
}

/** Every distinct beam and yarn lot a set of rolls carries. */
export function provenance(rolls) {
  requireArray(rolls, 'rolls', { min: 1 });
  const beams = new Set();
  const yarnLots = new Set();
  let unrecorded = 0;
  for (const roll of rolls) {
    const beam = beamOf(roll);
    if (beam === null) unrecorded += 1;
    else beams.add(beam);
    for (const lot of yarnLotsOf(roll)) {
      yarnLots.add(lot);
    }
  }
  return {
    beams: [...beams].sort(),
    yarnLots: [...yarnLots].sort(),
    unrecorded,
    rolls: rolls.length,
  };
}

export const RISKS = Object.freeze(['none', 'watch', 'high', 'unknown']);

/**
 * The barre risk a lot carries. Unrecorded provenance is its own answer and not
 * a low risk: a lot nobody can trace is the one that turns into an argument.
 */
export function barreRisk(rolls, { allowBeams = 1, allowYarnLots = 2 } = {}) {
  const found = provenance(rolls);
  if (found.unrecorded > 0 && found.beams.length === 0) {
    return { risk: 'unknown', reason: 'no beam is recorded on any roll', ...found };
  }
  if (found.unrecorded > 0) {
    return {
      risk: 'unknown',
      reason: `${found.unrecorded} of ${found.rolls} rolls carry no beam`,
      ...found,
    };
  }
  if (found.beams.length > allowBeams) {
    return {
      risk: 'high',
      reason: `${found.beams.length} beams in one lot, which is where barre comes from`,
      ...found,
    };
  }
  if (found.yarnLots.length > allowYarnLots) {
    return {
      risk: 'watch',
      reason: `${found.yarnLots.length} yarn lots across one beam`,
      ...found,
    };
  }
  return { risk: 'none', reason: 'one beam and a normal spread of yarn lots', ...found };
}

/**
 * Split a set of rolls so each part carries one beam. This is what the planner
 * does when a lot flags high and the customer will take two deliveries.
 */
export function splitByBeam(rolls) {
  const groups = new Map();
  for (const roll of rolls) {
    const beam = beamOf(roll);
    if (beam === null) {
      throw new FieldError('roll.beam', 'is not recorded, the rolls cannot be split', roll.id);
    }
    if (!groups.has(beam)) groups.set(beam, []);
    groups.get(beam).push(roll);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([beam, members]) => ({ beam, rolls: members }));
}

/** Which rolls to pull if a barre complaint names a beam. */
export function rollsFromBeam(rolls, beam) {
  requireText(beam, 'beam', { maxLength: 32 });
  return rolls.filter((roll) => beamOf(roll) === beam).map((roll) => roll.id);
}

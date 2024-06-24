/**
 * Effluent.
 *
 * The discharge consent is written per day and per parameter, and the works is
 * fined on the day it is breached rather than on the month it averaged. So this
 * totals a day and compares it to the consent, and nothing here reports a mean.
 *
 * Colour is the awkward one. It is consented as an absorbance and the only
 * honest per batch number is the unfixed dye, which is the dye charged less the
 * dye that ended on the cloth.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requireNonNegative,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const PARAMETERS = ['volume', 'cod', 'tds', 'colour', 'ph'];

export function makeConsent(input) {
  const name = requireText(input.name, 'consent.name', { maxLength: 60 });
  return Object.freeze({
    name,
    volumeM3: requirePositive(input.volumeM3, 'consent.volumeM3'),
    codKg: requirePositive(input.codKg, 'consent.codKg'),
    tdsKg: requirePositive(input.tdsKg, 'consent.tdsKg'),
    colourUnits: requirePositive(input.colourUnits, 'consent.colourUnits'),
    phLow: requireInRange(
      optional(input.phLow, (v) => v, 6),
      'consent.phLow',
      0,
      14
    ),
    phHigh: requireInRange(
      optional(input.phHigh, (v) => v, 9),
      'consent.phHigh',
      0,
      14
    ),
  });
}

/**
 * The load one batch puts down the drain. Fixation is the share of dye that
 * stayed on the cloth, so one minus it is what left in the liquor.
 */
export function batchLoad({ water, card, fixation = 0.75, chemicals }) {
  requireInRange(fixation, 'fixation', 0, 1);
  const volumeM3 = water.net / 1000;
  const dyeKg = card.lines
    .filter((line) => line.kind === 'dye')
    .reduce((sum, line) => sum + line.kg, 0);
  const unfixedKg = dyeKg * (1 - fixation);

  let codKg = 0;
  let tdsKg = 0;
  for (const line of card.lines) {
    if (line.kind === 'dye') continue;
    const chemical = chemicals?.get(line.code);
    codKg += line.kg * (chemical?.codLoad ?? 0);
    if (chemical?.role === 'salt' || chemical?.role === 'alkali') {
      tdsKg += line.kg;
    }
  }
  codKg += unfixedKg * 1.6;

  return {
    volumeM3,
    codKg,
    tdsKg,
    unfixedKg,
    colourUnits: (unfixedKg * 1000) / Math.max(volumeM3, 0.001),
  };
}

export function totalDay(loads) {
  requireArray(loads, 'loads', { min: 1 });
  return loads.reduce(
    (sum, load) => ({
      volumeM3: sum.volumeM3 + load.volumeM3,
      codKg: sum.codKg + load.codKg,
      tdsKg: sum.tdsKg + load.tdsKg,
      unfixedKg: sum.unfixedKg + load.unfixedKg,
      colourUnits:
        (sum.colourUnits * sum.volumeM3 + load.colourUnits * load.volumeM3) /
        (sum.volumeM3 + load.volumeM3),
    }),
    { volumeM3: 0, codKg: 0, tdsKg: 0, unfixedKg: 0, colourUnits: 0 }
  );
}

/** Compare a day against the consent and name every parameter that breached. */
export function checkConsent(consent, day, { ph } = {}) {
  const breaches = [];
  const check = (parameter, value, limit) => {
    if (value > limit) {
      breaches.push({ parameter, value, limit, over: value / limit - 1 });
    }
  };
  check('volume', day.volumeM3, consent.volumeM3);
  check('cod', day.codKg, consent.codKg);
  check('tds', day.tdsKg, consent.tdsKg);
  check('colour', day.colourUnits, consent.colourUnits);
  if (ph !== undefined) {
    requireNonNegative(ph, 'ph');
    if (ph < consent.phLow || ph > consent.phHigh) {
      breaches.push({
        parameter: 'ph',
        value: ph,
        limit: `${consent.phLow} to ${consent.phHigh}`,
        over: null,
      });
    }
  }
  return { compliant: breaches.length === 0, breaches };
}

/** Headroom left on the day, as a share of each limit, for a planner to read. */
export function headroom(consent, day) {
  const parameters = { volume: 'volumeM3', cod: 'codKg', tds: 'tdsKg', colour: 'colourUnits' };
  const out = {};
  for (const [name, key] of Object.entries(parameters)) {
    const limit =
      consent[
        key === 'volumeM3'
          ? 'volumeM3'
          : key === 'codKg'
            ? 'codKg'
            : key === 'tdsKg'
              ? 'tdsKg'
              : 'colourUnits'
      ];
    if (limit === undefined) {
      throw new FieldError('consent', `carries no limit for ${name}`, name);
    }
    out[name] = 1 - day[key] / limit;
  }
  return out;
}

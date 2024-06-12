/**
 * Water accounting.
 *
 * Water is metered at the works and not at the machine, so every per batch
 * figure here is a model rather than a reading. It has to be a model that adds
 * up to the meter, which means the rinses have to be counted properly: a rinse
 * is a fill and a drain, and a machine that overflows rinses instead uses water
 * at a rate for a time and never holds a fixed volume at all.
 */

import {
  FieldError,
  requireInteger,
  requireNonNegative,
  requireOneOf,
  requirePositive,
  optional,
} from '../valid/guards.js';

export const RINSE_KINDS = ['drop-and-fill', 'overflow'];

export function makeRinse(input) {
  const kind = requireOneOf(input.kind, 'rinse.kind', RINSE_KINDS);
  if (kind === 'drop-and-fill') {
    return Object.freeze({
      kind,
      baths: requireInteger(input.baths, 'rinse.baths'),
      temperature: optional(
        input.temperature,
        (v) => requireNonNegative(v, 'rinse.temperature'),
        40
      ),
    });
  }
  return Object.freeze({
    kind,
    litresPerMinute: requirePositive(input.litresPerMinute, 'rinse.litresPerMinute'),
    minutes: requirePositive(input.minutes, 'rinse.minutes'),
    temperature: optional(input.temperature, (v) => requireNonNegative(v, 'rinse.temperature'), 40),
  });
}

export function rinseVolume(rinse, bathLitres) {
  requirePositive(bathLitres, 'bathLitres');
  if (rinse.kind === 'drop-and-fill') {
    if (rinse.baths < 1) {
      throw new FieldError('rinse.baths', 'must be at least one', rinse.baths);
    }
    return rinse.baths * bathLitres;
  }
  return rinse.litresPerMinute * rinse.minutes;
}

/**
 * Total water for a batch: the dye bath itself, every rinse, and any soaping
 * bath. The dye bath is counted once even when it is reused, and reuse is
 * recorded as a saving rather than by leaving the fill out.
 */
export function batchWater({ bathLitres, rinses = [], soapBaths = 0, reusedBaths = 0 }) {
  requirePositive(bathLitres, 'bathLitres');
  requireNonNegative(soapBaths, 'soapBaths');
  requireNonNegative(reusedBaths, 'reusedBaths');
  const dye = bathLitres;
  const rinsed = rinses.reduce((sum, rinse) => sum + rinseVolume(rinse, bathLitres), 0);
  const soap = soapBaths * bathLitres;
  const saved = reusedBaths * bathLitres;
  const gross = dye + rinsed + soap;
  if (saved > gross) {
    throw new FieldError('reusedBaths', 'saves more water than the batch uses', reusedBaths);
  }
  return { dye, rinsed, soap, gross, saved, net: gross - saved };
}

/** Litres per kilogram of cloth, which is the number the works is benchmarked on. */
export function specificWater(water, fibreKg) {
  requirePositive(fibreKg, 'fibreKg');
  return water.net / fibreKg;
}

/** Where the water went, as shares of the net, for a pie nobody will read. */
export function waterShares(water) {
  const total = water.gross;
  return {
    dye: water.dye / total,
    rinsed: water.rinsed / total,
    soap: water.soap / total,
  };
}

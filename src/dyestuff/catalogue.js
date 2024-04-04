/**
 * The dyestuff catalogue.
 *
 * A dyehouse buys the same colour index number from three suppliers and they
 * are not interchangeable. Strength differs, the shade of the pure dye differs,
 * and the fastness the supplier claims differs. Everything is therefore keyed on
 * the supplier's own article code, with the colour index recorded alongside as
 * the thing that makes two articles candidates for substitution rather than
 * equals.
 */

import {
  FieldError,
  requireInRange,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const CLASSES = ['reactive', 'disperse', 'acid', 'direct', 'vat', 'basic'];

/** Which fibres each class will actually colour to a commercial standard. */
export const CLASS_FIBRES = Object.freeze({
  reactive: ['cotton', 'viscose', 'wool'],
  disperse: ['polyester', 'acrylic'],
  acid: ['wool', 'polyamide'],
  direct: ['cotton', 'viscose'],
  vat: ['cotton', 'viscose'],
  basic: ['acrylic'],
});

export const FASTNESS_TESTS = ['wash', 'light', 'rubDry', 'rubWet', 'perspiration'];

function normaliseFastness(input) {
  const out = {};
  for (const test of FASTNESS_TESTS) {
    const value = input?.[test];
    if (value === undefined || value === null) continue;
    const ceiling = test === 'light' ? 8 : 5;
    out[test] = requireInRange(value, `fastness.${test}`, 1, ceiling);
  }
  return out;
}

export function makeDyestuff(input) {
  const code = requireText(input.code, 'dyestuff.code', { maxLength: 32 });
  const name = requireText(input.name, 'dyestuff.name', { maxLength: 80 });
  const supplier = requireText(input.supplier, 'dyestuff.supplier', { maxLength: 60 });
  const dyeClass = requireOneOf(input.dyeClass, 'dyestuff.dyeClass', CLASSES);
  const colourIndex = optional(
    input.colourIndex,
    (v) => requireText(v, 'dyestuff.colourIndex', { maxLength: 24 }).toUpperCase(),
    null
  );
  const strength = optional(input.strength, (v) => requirePositive(v, 'dyestuff.strength'), 100);
  const pricePerKg = requirePositive(input.pricePerKg, 'dyestuff.pricePerKg');
  const maxOwf = optional(input.maxOwf, (v) => requirePositive(v, 'dyestuff.maxOwf'), 8);

  return Object.freeze({
    code,
    name,
    supplier,
    dyeClass,
    colourIndex,
    strength,
    pricePerKg,
    maxOwf,
    fastness: Object.freeze(normaliseFastness(input.fastness)),
    fibres: Object.freeze([...CLASS_FIBRES[dyeClass]]),
  });
}

export function createCatalogue(dyestuffs = []) {
  const byCode = new Map();
  for (const dyestuff of dyestuffs) {
    if (byCode.has(dyestuff.code)) {
      throw new FieldError('dyestuff.code', 'appears twice in the catalogue', dyestuff.code);
    }
    byCode.set(dyestuff.code, dyestuff);
  }
  return byCode;
}

export function find(catalogue, code) {
  const dyestuff = catalogue.get(requireText(code, 'code', { maxLength: 32 }));
  if (!dyestuff) {
    throw new FieldError('code', 'is not in the catalogue', code);
  }
  return dyestuff;
}

export function dyesFor(catalogue, fibre) {
  return [...catalogue.values()].filter((dyestuff) => dyestuff.fibres.includes(fibre));
}

/** Articles sharing a colour index, which is where a substitution starts. */
export function sameColourIndex(catalogue, code) {
  const target = find(catalogue, code);
  if (!target.colourIndex) return [];
  return [...catalogue.values()].filter(
    (dyestuff) => dyestuff.colourIndex === target.colourIndex && dyestuff.code !== target.code
  );
}

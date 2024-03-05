/**
 * Unit handling for a dyehouse floor.
 *
 * The floor runs metric. Customers, especially the ones shipping to North
 * America, quote in pounds, yards and ounces per square yard. Every number that
 * crosses the boundary goes through here so there is exactly one place where a
 * conversion factor lives.
 */

const KILOGRAMS_PER_POUND = 0.45359237;
const METRES_PER_YARD = 0.9144;
const METRES_PER_INCH = 0.0254;
const GRAMS_PER_OUNCE = 28.349523125;
const LITRES_PER_US_GALLON = 3.785411784;

const MASS = {
  kg: 1,
  g: 0.001,
  lb: KILOGRAMS_PER_POUND,
  oz: GRAMS_PER_OUNCE / 1000,
};

const LENGTH = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  yd: METRES_PER_YARD,
  in: METRES_PER_INCH,
};

const VOLUME = {
  l: 1,
  ml: 0.001,
  galUS: LITRES_PER_US_GALLON,
};

function factorFor(table, unit, kind) {
  const factor = table[unit];
  if (factor === undefined) {
    const known = Object.keys(table).join(', ');
    throw new RangeError(`unknown ${kind} unit "${unit}", expected one of ${known}`);
  }
  return factor;
}

function convert(table, kind, value, from, to) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${kind} value must be a finite number, received ${String(value)}`);
  }
  const fromFactor = factorFor(table, from, kind);
  const toFactor = factorFor(table, to, kind);
  return (value * fromFactor) / toFactor;
}

export function convertMass(value, from, to) {
  return convert(MASS, 'mass', value, from, to);
}

export function convertLength(value, from, to) {
  return convert(LENGTH, 'length', value, from, to);
}

export function convertVolume(value, from, to) {
  return convert(VOLUME, 'volume', value, from, to);
}

export function toKilograms(value, from) {
  return convertMass(value, from, 'kg');
}

export function toMetres(value, from) {
  return convertLength(value, from, 'm');
}

export function toLitres(value, from) {
  return convertVolume(value, from, 'l');
}

export function massUnits() {
  return Object.keys(MASS);
}

export function lengthUnits() {
  return Object.keys(LENGTH);
}

export function volumeUnits() {
  return Object.keys(VOLUME);
}

export const factors = Object.freeze({
  KILOGRAMS_PER_POUND,
  METRES_PER_YARD,
  METRES_PER_INCH,
  GRAMS_PER_OUNCE,
  LITRES_PER_US_GALLON,
});

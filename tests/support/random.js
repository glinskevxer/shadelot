/**
 * The generator the property tests draw from.
 *
 * Four files had a copy of this and two of them had drifted: one seeded from
 * Date.now, which made a failure impossible to reproduce, and one used a
 * multiplier that repeats after a few thousand draws. This is the one they all
 * use now, and it is a plain linear congruential generator with the numerical
 * recipes constants, chosen because it is short enough to read and a failure
 * always names a seed somebody can put straight back in.
 */

const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;

export function generator(seed) {
  if (!Number.isInteger(seed) || seed < 0) {
    throw new RangeError(`seed must be a whole number, received ${String(seed)}`);
  }
  let state = seed >>> 0;
  return () => {
    state = (state * MULTIPLIER + INCREMENT) >>> 0;
    return state / 4294967296;
  };
}

export function between(random, low, high) {
  if (!(high > low)) {
    throw new RangeError(`the range ${low} to ${high} is empty or the wrong way round`);
  }
  return low + random() * (high - low);
}

export function pick(random, list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new RangeError('cannot pick from an empty list');
  }
  return list[Math.floor(random() * list.length)];
}

export function integer(random, low, high) {
  return Math.floor(between(random, low, high + 1));
}

/** The seeds every property file runs, so a failure names one of these. */
export const SEEDS = Object.freeze([1, 7, 42, 1997, 20250416]);

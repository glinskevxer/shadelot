/**
 * Handle.
 *
 * What the cloth feels like, which is the one thing on the specification that
 * nobody can measure and everybody argues about. A softener puts the handle up
 * and the rub fastness down, and it puts sewability up and seam slippage
 * resistance down, and a customer who asked for softer and got a garment that
 * seams badly will say the dyeing was wrong.
 *
 * So the trade-offs are written down. The scale is the works' own one to five,
 * which is what the handle panel scores, and the effects are its own regression
 * on two years of panel scores.
 */

import {
  FieldError,
  requireInRange,
  requireOneOf,
  requirePositive,
  optional,
} from '../valid/guards.js';

export const SOFTENERS = Object.freeze([
  'none',
  'cationic',
  'silicone',
  'macro-silicone',
  'hydrophilic',
]);

/** What each softener does per percent on weight, on the works panel scale. */
export const EFFECTS = Object.freeze({
  none: { handle: 0, rubWet: 0, sewability: 0, slippage: 0, whiteness: 0 },
  cationic: { handle: 1.1, rubWet: -0.55, sewability: 0.4, slippage: -0.5, whiteness: -0.9 },
  silicone: { handle: 1.6, rubWet: -0.3, sewability: 0.9, slippage: -1.1, whiteness: -0.2 },
  'macro-silicone': {
    handle: 2.1,
    rubWet: -0.45,
    sewability: 1.2,
    slippage: -1.6,
    whiteness: -0.3,
  },
  hydrophilic: { handle: 0.9, rubWet: -0.15, sewability: 0.5, slippage: -0.4, whiteness: -0.1 },
});

export function effectsFor(softener) {
  return EFFECTS[requireOneOf(softener, 'softener', SOFTENERS)];
}

const AXES = ['handle', 'rubWet', 'sewability', 'slippage', 'whiteness'];

function clamp(value) {
  return Math.max(1, Math.min(5, value));
}

/**
 * What a finish does to a base cloth. Every axis is clamped to the panel scale,
 * because a panel cannot score a six however good the cloth is.
 */
export function applyFinish(base, softener, owf) {
  requirePositive(owf, 'owf');
  requireInRange(owf, 'owf', 0.05, 6);
  const effects = effectsFor(softener);
  const out = {};
  for (const axis of AXES) {
    const start = requireInRange(optional(base[axis], Number, 3), `base.${axis}`, 1, 5);
    out[axis] = clamp(start + effects[axis] * owf);
  }
  return { softener, owf, ...out };
}

/**
 * Judge a finish against a specification. Handle is a floor and everything else
 * it costs is a floor too, which is the whole point: a finish that meets the
 * handle by failing the rub fastness has not met the specification.
 */
export function judgeFinish(result, specification) {
  const breaches = [];
  for (const axis of AXES) {
    const floor = specification[axis];
    if (floor === undefined) continue;
    requireInRange(floor, `specification.${axis}`, 1, 5);
    if (result[axis] < floor) {
      breaches.push({ axis, value: result[axis], floor });
    }
  }
  return { verdict: breaches.length === 0 ? 'pass' : 'fail', breaches };
}

/**
 * The cheapest finish that meets a specification, searched over the softeners
 * and the doses the works runs. Cheapest means the least softener, because that
 * is what costs and what does the damage.
 */
export function prescribeFinish(base, specification, { doses = [0.5, 1, 1.5, 2, 3], prices } = {}) {
  const cost = (softener, owf) => (prices?.[softener] ?? 1) * owf;
  const candidates = [];
  for (const softener of SOFTENERS) {
    for (const owf of doses) {
      const result = applyFinish(base, softener, owf);
      if (judgeFinish(result, specification).verdict === 'pass') {
        candidates.push({ softener, owf, cost: cost(softener, owf), result });
      }
    }
  }
  if (candidates.length === 0) {
    throw new FieldError(
      'specification',
      'cannot be met by any finish this works runs on this cloth',
      Object.keys(specification)
    );
  }
  return candidates.sort((a, b) => a.cost - b.cost || a.owf - b.owf)[0];
}

/** The trade off a finish made, for the note that goes back to the customer. */
export function describeTradeoff(before, after) {
  const moved = AXES.map((axis) => ({ axis, change: after[axis] - before[axis] }))
    .filter((row) => Math.abs(row.change) >= 0.05)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  if (moved.length === 0) return 'nothing moved';
  return moved
    .map(
      (row) => `${row.axis} ${row.change > 0 ? 'up' : 'down'} ${Math.abs(row.change).toFixed(2)}`
    )
    .join(', ');
}

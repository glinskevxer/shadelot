/**
 * What to do with a batch that is off shade.
 *
 * There are four answers and only four: let it go, add more dye, strip and redye
 * from scratch, or reclassify it as a second. The choice is not a judgement
 * call, it is a decision tree, and writing it down here is the difference
 * between a works that knows its right first time rate and one that argues
 * about it.
 *
 * The order of the tests matters. A batch that is off in hue cannot be brought
 * back by adding more of the same recipe however weak it also is, so the hue
 * test comes before the strength test.
 */

import { FieldError, requireInRange, requirePositive, optional } from '../valid/guards.js';
import { lchDifference } from '../colour/lab.js';
import { colourStrength } from '../colour/reflectance.js';

export const ACTIONS = ['accept', 'add-on', 'strip-and-redye', 'downgrade'];

export const DEFAULT_LIMITS = Object.freeze({
  hueLimit: 0.6,
  addOnFloor: 0.85,
  addOnCeiling: 0.995,
  stripFloor: 0.6,
  stripCount: 2,
});

/**
 * The dye to add to bring a weak batch up. Exhaustion is never complete on an
 * add on, so the shortfall is divided by the expected exhaustion rather than
 * dosed straight.
 */
export function addOnDose(recipeOwf, strength, { exhaustion = 0.7 } = {}) {
  requirePositive(recipeOwf, 'recipeOwf');
  requireInRange(strength, 'strength', 0.01, 2);
  requireInRange(exhaustion, 'exhaustion', 0.05, 1);
  if (strength >= 1) return 0;
  return (recipeOwf * (1 - strength)) / exhaustion;
}

/**
 * Decide what happens to a batch. Everything the decision needs is passed in;
 * nothing is read from a global, because this gets called from a test harness
 * as often as from the floor.
 */
export function decide(context) {
  const limits = { ...DEFAULT_LIMITS, ...(context.limits ?? {}) };
  const { standard, batch, verdict, priorCorrections = 0 } = context;
  if (!ACTIONS.includes('accept')) {
    throw new FieldError('ACTIONS', 'is malformed', ACTIONS);
  }
  if (verdict === 'pass' || verdict === 'marginal') {
    return { action: 'accept', reason: `the batch judged ${verdict}` };
  }

  const difference = lchDifference(standard, batch);
  if (Math.abs(difference.dH) > limits.hueLimit) {
    if (priorCorrections >= limits.stripCount) {
      return { action: 'downgrade', reason: 'hue is out and the batch has been corrected twice' };
    }
    return { action: 'strip-and-redye', reason: 'hue is out and adding dye cannot turn a shade' };
  }

  const strength = optional(
    context.strength,
    (v) => requireInRange(v, 'strength', 0.01, 2),
    strengthFrom(context)
  );
  if (strength === null) {
    return {
      action: 'strip-and-redye',
      reason: 'no strength reading, so nothing can be added safely',
    };
  }
  if (strength >= limits.addOnCeiling) {
    return { action: 'downgrade', reason: 'the batch is heavy, and dye cannot be taken back out' };
  }
  if (strength >= limits.addOnFloor) {
    if (priorCorrections >= limits.stripCount) {
      return { action: 'downgrade', reason: 'two add ons have already been run on this batch' };
    }
    return {
      action: 'add-on',
      reason: `the batch is ${Math.round((1 - strength) * 100)} percent weak`,
    };
  }
  if (strength >= limits.stripFloor) {
    return { action: 'strip-and-redye', reason: 'too weak for an add on to land level' };
  }
  return { action: 'downgrade', reason: 'the batch is too far off to be worth the water' };
}

function strengthFrom(context) {
  if (!context.standardCurve || !context.batchCurve) return null;
  return colourStrength(context.standardCurve, context.batchCurve);
}

/** Whether an action puts the batch back through a machine. */
export function usesMachineTime(action) {
  if (!ACTIONS.includes(action)) {
    throw new FieldError('action', `must be one of ${ACTIONS.join(', ')}`, action);
  }
  return action === 'add-on' || action === 'strip-and-redye';
}

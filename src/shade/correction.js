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

export const ACTIONS = Object.freeze(['accept', 'add-on', 'strip-and-redye', 'downgrade']);

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
 * The rules, in the order they are read. The first one that answers decides,
 * and each one gets the whole context so a later rule can never quietly undo an
 * earlier one. Adding a rule means adding a row here rather than another branch
 * inside a function nobody can hold in their head.
 */
export const RULES = Object.freeze([
  {
    name: 'already acceptable',
    when: ({ verdict }) => verdict === 'pass' || verdict === 'marginal',
    then: ({ verdict }) => ({ action: 'accept', reason: `the batch judged ${verdict}` }),
  },
  {
    name: 'hue out and corrected twice',
    when: ({ hueOut, priorCorrections, limits }) => hueOut && priorCorrections >= limits.stripCount,
    then: () => ({
      action: 'downgrade',
      reason: 'hue is out and the batch has been corrected twice',
    }),
  },
  {
    name: 'hue out',
    when: ({ hueOut }) => hueOut,
    then: () => ({
      action: 'strip-and-redye',
      reason: 'hue is out and adding dye cannot turn a shade',
    }),
  },
  {
    name: 'no strength reading',
    when: ({ strength }) => strength === null,
    then: () => ({
      action: 'strip-and-redye',
      reason: 'no strength reading, so nothing can be added safely',
    }),
  },
  {
    name: 'heavy',
    when: ({ strength, limits }) => strength >= limits.addOnCeiling,
    then: () => ({
      action: 'downgrade',
      reason: 'the batch is heavy, and dye cannot be taken back out',
    }),
  },
  {
    name: 'weak and corrected twice',
    when: ({ strength, limits, priorCorrections }) =>
      strength >= limits.addOnFloor && priorCorrections >= limits.stripCount,
    then: () => ({
      action: 'downgrade',
      reason: 'two add ons have already been run on this batch',
    }),
  },
  {
    name: 'weak enough to add on',
    when: ({ strength, limits }) => strength >= limits.addOnFloor,
    then: ({ strength }) => ({
      action: 'add-on',
      reason: `the batch is ${Math.round((1 - strength) * 100)} percent weak`,
    }),
  },
  {
    name: 'too weak to add on',
    when: ({ strength, limits }) => strength >= limits.stripFloor,
    then: () => ({ action: 'strip-and-redye', reason: 'too weak for an add on to land level' }),
  },
  {
    name: 'beyond correction',
    when: () => true,
    then: () => ({ action: 'downgrade', reason: 'the batch is too far off to be worth the water' }),
  },
]);

/**
 * Work the facts each rule reads out of the raw context once, so no rule has to
 * recompute a difference or a strength and no two rules can disagree about one.
 */
export function readFacts(context) {
  const limits = { ...DEFAULT_LIMITS, ...(context.limits ?? {}) };
  const difference = lchDifference(context.standard, context.batch);
  const strength = optional(
    context.strength,
    (v) => requireInRange(v, 'strength', 0.01, 2),
    strengthFrom(context)
  );
  return {
    ...context,
    limits,
    difference,
    strength,
    hueOut: Math.abs(difference.dH) > limits.hueLimit,
    priorCorrections: context.priorCorrections ?? 0,
  };
}

/** Decide what happens to a batch. The rule that fired comes back with it. */
export function decide(context) {
  const facts = readFacts(context);
  const rule = RULES.find((candidate) => candidate.when(facts));
  if (!rule) {
    throw new FieldError('RULES', 'ended without a decision, which cannot happen', RULES.length);
  }
  return { ...rule.then(facts), rule: rule.name };
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

/**
 * The defect register.
 *
 * Faults are recorded per roll and per metre, because that is how the cutting
 * room is going to meet them. A four point system is used for grading: the
 * points a fault earns depend on its length, and a roll over the points per
 * hundred square metres limit is a second whatever caused it.
 *
 * The system is old and the thresholds are the published ones. What is local is
 * the list of causes, and which of them the dyehouse can be charged for.
 */

import {
  FieldError,
  requireInRange,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const CAUSES = ['weaving', 'knitting', 'yarn', 'dyeing', 'finishing', 'handling', 'unknown'];

/** The causes a commission dyehouse carries the cost of. */
export const OURS = Object.freeze(['dyeing', 'finishing', 'handling']);

export const FAULT_KINDS = [
  'barre',
  'crease',
  'stain',
  'shade-bar',
  'hole',
  'slub',
  'oil-mark',
  'listing',
];

/** The four point system. Length in centimetres decides the points. */
export function pointsFor(lengthCm) {
  requirePositive(lengthCm, 'lengthCm');
  if (lengthCm <= 7.6) return 1;
  if (lengthCm <= 15.2) return 2;
  if (lengthCm <= 22.9) return 3;
  return 4;
}

export function makeFault(input) {
  return Object.freeze({
    rollId: requireText(input.rollId, 'fault.rollId', { maxLength: 24 }),
    atMetres: requirePositive(input.atMetres, 'fault.atMetres'),
    kind: requireOneOf(input.kind, 'fault.kind', FAULT_KINDS),
    cause: requireOneOf(optional(input.cause, String, 'unknown'), 'fault.cause', CAUSES),
    lengthCm: requirePositive(input.lengthCm, 'fault.lengthCm'),
    points: pointsFor(input.lengthCm),
    note: optional(input.note, (v) => requireText(v, 'fault.note', { maxLength: 200 }), null),
  });
}

/** Points per hundred square metres, which is the number the grade reads off. */
export function pointsPerHundred(faults, { lengthMetres, widthCm }) {
  requirePositive(lengthMetres, 'lengthMetres');
  requireInRange(widthCm, 'widthCm', 1, 600);
  const squareMetres = (lengthMetres * widthCm) / 100;
  const points = faults.reduce((sum, fault) => sum + fault.points, 0);
  return (points * 100) / squareMetres;
}

export const GRADE_LIMIT = 20;

export function gradeRoll(faults, dimensions, { limit = GRADE_LIMIT } = {}) {
  requirePositive(limit, 'limit');
  const score = pointsPerHundred(faults, dimensions);
  const ours = faults.filter((fault) => OURS.includes(fault.cause));
  return {
    score,
    grade: score <= limit ? 'first' : 'second',
    faults: faults.length,
    oursCount: ours.length,
    oursPoints: ours.reduce((sum, fault) => sum + fault.points, 0),
  };
}

/** Split the points by who caused them, for the argument with the weaver. */
export function pointsByCause(faults) {
  const totals = Object.fromEntries(CAUSES.map((cause) => [cause, 0]));
  for (const fault of faults) {
    if (totals[fault.cause] === undefined) {
      throw new FieldError('fault.cause', 'is not a cause the register knows', fault.cause);
    }
    totals[fault.cause] += fault.points;
  }
  return totals;
}

/** The share of the points this dyehouse is answerable for. */
export function ourShare(faults) {
  const total = faults.reduce((sum, fault) => sum + fault.points, 0);
  if (total === 0) return 0;
  const ours = faults
    .filter((fault) => OURS.includes(fault.cause))
    .reduce((sum, fault) => sum + fault.points, 0);
  return ours / total;
}

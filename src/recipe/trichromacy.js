/**
 * Correcting a trichromat.
 *
 * A shade off in three directions is corrected by moving three dyes, and the
 * arithmetic is a small linear system: how far each dye moves L, a and b per
 * percent on weight, inverted against the difference that has to be closed.
 *
 * The coefficients are measured, not derived, and they only hold near the shade
 * they were measured at. So the correction is capped and the caller is told when
 * the answer is an extrapolation rather than a reading.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requirePositive,
  optional,
} from '../valid/guards.js';
import { labDifference } from '../colour/lab.js';

/**
 * A vector is what one percent on weight of a dye does to the reading, near
 * the depth it was measured at.
 */
export function makeVector(input) {
  return Object.freeze({
    code: input.code,
    dL: requireInRange(input.dL, 'vector.dL', -200, 200),
    da: requireInRange(input.da, 'vector.da', -200, 200),
    db: requireInRange(input.db, 'vector.db', -200, 200),
    atOwf: requirePositive(optional(input.atOwf, Number, 1), 'vector.atOwf'),
  });
}

function determinant(m) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Solve a three by three system by Cramer's rule, which is exact and short. */
export function solve3(matrix, target) {
  const base = determinant(matrix);
  if (Math.abs(base) < 1e-9) {
    throw new FieldError('matrix', 'is singular, the three dyes do not span the space', base);
  }
  return [0, 1, 2].map((column) => {
    const replaced = matrix.map((row, index) =>
      row.map((value, j) => (j === column ? target[index] : value))
    );
    return determinant(replaced) / base;
  });
}

/**
 * The change in each dye that would close the difference between a standard and
 * a batch. Positive means add. The cap is on the absolute move rather than on
 * the fraction, because a trace dye at 0.02 percent can legitimately double.
 */
export function correctionFor(standard, batch, vectors, { cap = 0.5 } = {}) {
  requireArray(vectors, 'vectors', { min: 3 });
  requirePositive(cap, 'cap');
  if (vectors.length !== 3) {
    throw new FieldError('vectors', 'must name exactly three dyes', vectors.length);
  }
  const { dL, da, db } = labDifference(standard, batch);
  const matrix = [
    vectors.map((vector) => vector.dL),
    vectors.map((vector) => vector.da),
    vectors.map((vector) => vector.db),
  ];
  const moves = solve3(matrix, [-dL, -da, -db]);
  return vectors.map((vector, index) => {
    const wanted = moves[index];
    const applied = Math.max(-cap, Math.min(cap, wanted));
    return {
      code: vector.code,
      wanted,
      applied,
      capped: applied !== wanted,
    };
  });
}

/** What the correction is predicted to do, for comparing against what it did. */
export function predict(batch, corrections, vectors) {
  const byCode = new Map(vectors.map((vector) => [vector.code, vector]));
  return corrections.reduce(
    (reading, correction) => {
      const vector = byCode.get(correction.code);
      if (!vector) {
        throw new FieldError('correction.code', 'has no vector against it', correction.code);
      }
      return {
        L: reading.L + vector.dL * correction.applied,
        a: reading.a + vector.da * correction.applied,
        b: reading.b + vector.db * correction.applied,
      };
    },
    { L: batch.L, a: batch.a, b: batch.b }
  );
}

/**
 * Whether a correction is inside the range the vectors were measured over. A
 * move bigger than the measurement depth is an extrapolation and the lab should
 * dip it rather than run it.
 */
export function isExtrapolation(corrections, vectors, { factor = 0.5 } = {}) {
  const byCode = new Map(vectors.map((vector) => [vector.code, vector]));
  return corrections.some((correction) => {
    const vector = byCode.get(correction.code);
    return Math.abs(correction.applied) > vector.atOwf * factor;
  });
}

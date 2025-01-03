/**
 * Trichromatic compatibility.
 *
 * Three dyes in one bath is the ordinary case, and the three do not behave the
 * same way. One strikes early and levels slowly, another the reverse, and the
 * shade that comes out at the end depends on how far apart they are. A
 * combination whose members disagree badly gives a batch that looks right at
 * the end of the bath and comes out of the soaping a different colour.
 *
 * The numbers below are works measurements on this floor's own articles: a
 * strike rate and a migration rate on a nought to one scale, taken at the
 * standard profile.
 */

import {
  FieldError,
  requireArray,
  requireInRange,
  requireText,
  optional,
} from '../valid/guards.js';

export function makeBehaviour(input) {
  return Object.freeze({
    code: requireText(input.code, 'behaviour.code', { maxLength: 32 }),
    strike: requireInRange(input.strike, 'behaviour.strike', 0, 1),
    migration: requireInRange(input.migration, 'behaviour.migration', 0, 1),
    saltSensitivity: requireInRange(
      optional(input.saltSensitivity, Number, 0.5),
      'behaviour.saltSensitivity',
      0,
      1
    ),
  });
}

export function createBehaviourBook(behaviours = []) {
  const book = new Map();
  for (const behaviour of requireArray(behaviours, 'behaviours')) {
    if (book.has(behaviour.code)) {
      throw new FieldError('behaviour.code', 'appears twice in the book', behaviour.code);
    }
    book.set(behaviour.code, behaviour);
  }
  return book;
}

export function behaviourFor(book, code) {
  const behaviour = book.get(code);
  if (!behaviour) {
    throw new FieldError('code', 'has no measured behaviour on this floor', code);
  }
  return behaviour;
}

/**
 * How far apart two dyes sit. Zero is identical behaviour and one is as far
 * apart as two dyes can be on this floor's measurements.
 */
export function separation(a, b) {
  const strike = Math.abs(a.strike - b.strike);
  const migration = Math.abs(a.migration - b.migration);
  const salt = Math.abs(a.saltSensitivity - b.saltSensitivity);
  return strike * 0.5 + migration * 0.35 + salt * 0.15;
}

export const GRADES = ['good', 'workable', 'poor'];

export function gradeSeparation(value) {
  if (value <= 0.12) return 'good';
  if (value <= 0.28) return 'workable';
  return 'poor';
}

/**
 * Grade a whole combination. The grade is the worst pair, not the average,
 * because the pair that disagrees is the pair that shows.
 */
export function gradeCombination(book, codes) {
  requireArray(codes, 'codes', { min: 2 });
  const behaviours = codes.map((code) => behaviourFor(book, code));
  const pairs = [];
  for (let i = 0; i < behaviours.length; i += 1) {
    for (let j = i + 1; j < behaviours.length; j += 1) {
      const value = separation(behaviours[i], behaviours[j]);
      pairs.push({
        a: behaviours[i].code,
        b: behaviours[j].code,
        separation: value,
        grade: gradeSeparation(value),
      });
    }
  }
  const worst = pairs.reduce((worstPair, pair) =>
    pair.separation > worstPair.separation ? pair : worstPair
  );
  return { grade: worst.grade, worst, pairs: pairs.sort((x, y) => y.separation - x.separation) };
}

/**
 * What to do about a poor combination. Slowing the strike helps a pair that
 * differs in strike and does nothing for one that differs in migration, so the
 * advice reads which of the two is doing the damage.
 */
export function advise(book, codes) {
  const graded = gradeCombination(book, codes);
  if (graded.grade === 'good') {
    return { grade: graded.grade, advice: 'run the standard profile' };
  }
  const a = behaviourFor(book, graded.worst.a);
  const b = behaviourFor(book, graded.worst.b);
  const strikeGap = Math.abs(a.strike - b.strike);
  const migrationGap = Math.abs(a.migration - b.migration);
  if (strikeGap >= migrationGap) {
    return {
      grade: graded.grade,
      advice: 'dose the salt in more portions and hold the temperature down until it is all in',
      because: `${graded.worst.a} and ${graded.worst.b} strike at different rates`,
    };
  }
  return {
    grade: graded.grade,
    advice: 'hold longer at temperature before the alkali, to let the slower one migrate',
    because: `${graded.worst.a} and ${graded.worst.b} migrate at different rates`,
  };
}

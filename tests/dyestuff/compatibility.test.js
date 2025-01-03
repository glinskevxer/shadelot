import { describe, expect, it } from 'vitest';
import {
  GRADES,
  advise,
  behaviourFor,
  createBehaviourBook,
  gradeCombination,
  gradeSeparation,
  makeBehaviour,
  separation,
} from '../../src/dyestuff/compatibility.js';

const yellow = makeBehaviour({
  code: 'RY-145-ACME',
  strike: 0.52,
  migration: 0.6,
  saltSensitivity: 0.5,
});
const red = makeBehaviour({
  code: 'RR-195-ACME',
  strike: 0.55,
  migration: 0.58,
  saltSensitivity: 0.52,
});
const blue = makeBehaviour({
  code: 'RB-19-ACME',
  strike: 0.5,
  migration: 0.62,
  saltSensitivity: 0.48,
});
const awkward = makeBehaviour({
  code: 'RB-19-NORD',
  strike: 0.9,
  migration: 0.3,
  saltSensitivity: 0.9,
});
const slow = makeBehaviour({ code: 'RN-2', strike: 0.52, migration: 0.1, saltSensitivity: 0.5 });

const book = createBehaviourBook([yellow, red, blue, awkward, slow]);

describe('a behaviour', () => {
  it('defaults the salt sensitivity to the middle', () => {
    expect(makeBehaviour({ code: 'X', strike: 0.5, migration: 0.5 }).saltSensitivity).toBe(0.5);
  });

  it('refuses a rate outside the scale', () => {
    expect(() => makeBehaviour({ code: 'X', strike: 1.4, migration: 0.5 })).toThrow(/strike/);
    expect(() => makeBehaviour({ code: 'X', strike: 0.5, migration: -0.1 })).toThrow(/migration/);
  });

  it('refuses two entries for one article', () => {
    expect(() => createBehaviourBook([yellow, yellow])).toThrow(/appears twice/);
  });

  it('says so for an article nothing has been measured for', () => {
    expect(() => behaviourFor(book, 'RX-9')).toThrow(/no measured behaviour/);
  });
});

describe('separation', () => {
  it('is nothing for a dye against itself', () => {
    expect(separation(yellow, yellow)).toBe(0);
  });

  it('is symmetric', () => {
    expect(separation(yellow, awkward)).toBeCloseTo(separation(awkward, yellow), 12);
  });

  it('is small for a trichromat chosen to work together', () => {
    expect(separation(yellow, red)).toBeLessThan(0.12);
    expect(separation(yellow, blue)).toBeLessThan(0.12);
  });

  it('is large for one that was not', () => {
    expect(separation(yellow, awkward)).toBeGreaterThan(0.28);
  });

  it('grades on the published boundaries', () => {
    expect(gradeSeparation(0.12)).toBe('good');
    expect(gradeSeparation(0.121)).toBe('workable');
    expect(gradeSeparation(0.28)).toBe('workable');
    expect(gradeSeparation(0.281)).toBe('poor');
    expect(GRADES).toEqual(['good', 'workable', 'poor']);
  });
});

describe('grading a combination', () => {
  it('passes a matched trichromat', () => {
    const graded = gradeCombination(book, ['RY-145-ACME', 'RR-195-ACME', 'RB-19-ACME']);
    expect(graded.grade).toBe('good');
    expect(graded.pairs).toHaveLength(3);
  });

  it('takes the worst pair rather than the average', () => {
    const graded = gradeCombination(book, ['RY-145-ACME', 'RR-195-ACME', 'RB-19-NORD']);
    expect(graded.grade).toBe('poor');
    expect(graded.worst.b === 'RB-19-NORD' || graded.worst.a === 'RB-19-NORD').toBe(true);
  });

  it('orders the pairs worst first', () => {
    const graded = gradeCombination(book, ['RY-145-ACME', 'RR-195-ACME', 'RB-19-NORD']);
    for (let i = 1; i < graded.pairs.length; i += 1) {
      expect(graded.pairs[i - 1].separation).toBeGreaterThanOrEqual(graded.pairs[i].separation);
    }
  });

  it('needs at least two dyes to have anything to say', () => {
    expect(() => gradeCombination(book, ['RY-145-ACME'])).toThrow(/at least 2 entries/);
  });
});

describe('the advice', () => {
  it('says run the standard profile for a good combination', () => {
    const result = advise(book, ['RY-145-ACME', 'RR-195-ACME', 'RB-19-ACME']);
    expect(result.advice).toMatch(/standard profile/);
    expect(result.because).toBeUndefined();
  });

  it('blames the strike when that is the wider gap', () => {
    const result = advise(book, ['RY-145-ACME', 'RB-19-NORD']);
    expect(result.advice).toMatch(/salt in more portions/);
    expect(result.because).toMatch(/strike at different rates/);
  });

  it('blames the migration when that is the wider gap', () => {
    const result = advise(book, ['RY-145-ACME', 'RN-2']);
    expect(result.advice).toMatch(/hold longer at temperature/);
    expect(result.because).toMatch(/migrate at different rates/);
  });

  it('names the pair it is talking about', () => {
    const result = advise(book, ['RY-145-ACME', 'RR-195-ACME', 'RB-19-NORD']);
    expect(result.because).toMatch(/RB-19-NORD/);
  });
});

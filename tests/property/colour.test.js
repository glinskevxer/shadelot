/**
 * Properties of the colour arithmetic.
 *
 * Example tests pin the numbers that came out of the instrument. These pin the
 * things that have to hold for every reading, which is a different kind of
 * check and catches a different kind of mistake: a sign convention flipped in
 * one branch, a formula that stops being symmetric near an axis, a difference
 * that goes down when the batch moves further away.
 *
 * The generator is a small deterministic one rather than a library, so a
 * failure names a seed somebody can put straight back in.
 */

import { describe, expect, it } from 'vitest';
import {
  chroma,
  fromLch,
  hueAngle,
  labDifference,
  lchDifference,
  makeLab,
  toLch,
} from '../../src/colour/lab.js';
import { deltaE, formulaNames } from '../../src/colour/deltae.js';
import { judge, makeTolerance } from '../../src/colour/tolerance.js';
import { kOverS } from '../../src/colour/reflectance.js';
import { SEEDS, generator } from '../support/random.js';

function randomLab(random) {
  return makeLab(random() * 100, random() * 200 - 100, random() * 200 - 100);
}

describe('lab and lch', () => {
  it('round trips for every generated reading', () => {
    for (const seed of SEEDS) {
      const random = generator(seed);
      for (let i = 0; i < 200; i += 1) {
        const lab = randomLab(random);
        const back = fromLch(toLch(lab));
        expect(back.L, `seed ${seed} case ${i}`).toBeCloseTo(lab.L, 8);
        expect(back.a, `seed ${seed} case ${i}`).toBeCloseTo(lab.a, 8);
        expect(back.b, `seed ${seed} case ${i}`).toBeCloseTo(lab.b, 8);
      }
    }
  });

  it('keeps hue inside the half open circle', () => {
    const random = generator(3);
    for (let i = 0; i < 500; i += 1) {
      const h = hueAngle(randomLab(random));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('never reports a negative chroma', () => {
    const random = generator(11);
    for (let i = 0; i < 500; i += 1) {
      expect(chroma(randomLab(random))).toBeGreaterThanOrEqual(0);
    }
  });

  it('splits the ab movement into chroma and hue with nothing lost', () => {
    const random = generator(23);
    for (let i = 0; i < 400; i += 1) {
      const standard = randomLab(random);
      const batch = randomLab(random);
      const { da, db } = labDifference(standard, batch);
      const { dC, dH } = lchDifference(standard, batch);
      expect(Math.hypot(dC, dH)).toBeCloseTo(Math.hypot(da, db), 6);
    }
  });
});

describe('every difference formula', () => {
  it('reads zero against the sample itself', () => {
    const random = generator(101);
    for (let i = 0; i < 200; i += 1) {
      const lab = randomLab(random);
      for (const formula of formulaNames()) {
        expect(deltaE(formula, lab, lab), formula).toBeCloseTo(0, 9);
      }
    }
  });

  it('never goes negative', () => {
    const random = generator(202);
    for (let i = 0; i < 300; i += 1) {
      const a = randomLab(random);
      const b = randomLab(random);
      for (const formula of formulaNames()) {
        expect(deltaE(formula, a, b), formula).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('grows monotonically as the batch moves along one axis', () => {
    const random = generator(303);
    for (let i = 0; i < 150; i += 1) {
      const standard = makeLab(20 + random() * 60, random() * 60 - 30, random() * 60 - 30);
      let previous = -1;
      for (const step of [0.5, 1, 2, 4, 8]) {
        const value = deltaE('cie76', standard, makeLab(standard.L + step, standard.a, standard.b));
        expect(value).toBeGreaterThan(previous);
        previous = value;
      }
    }
  });

  it('is symmetric for the two that claim to be', () => {
    const random = generator(404);
    for (let i = 0; i < 200; i += 1) {
      const a = randomLab(random);
      const b = randomLab(random);
      expect(deltaE('cie76', a, b)).toBeCloseTo(deltaE('cie76', b, a), 9);
      expect(deltaE('ciede2000', a, b)).toBeCloseTo(deltaE('ciede2000', b, a), 6);
    }
  });
});

describe('judging', () => {
  const block = makeTolerance({ name: 'p', formula: 'cmc', total: 1, dL: 0.7, dC: 0.7, dH: 0.7 });

  it('never passes a batch whose total is past the limit', () => {
    const random = generator(505);
    for (let i = 0; i < 400; i += 1) {
      const standard = randomLab(random);
      const batch = randomLab(random);
      const result = judge(block, standard, batch);
      if (result.value > block.total) {
        expect(result.verdict).toBe('fail');
      }
    }
  });

  it('never fails a batch inside every limit', () => {
    const random = generator(606);
    for (let i = 0; i < 400; i += 1) {
      const standard = randomLab(random);
      const batch = randomLab(random);
      const result = judge(block, standard, batch);
      if (result.verdict === 'fail') {
        const overTotal = result.value > block.total;
        expect(overTotal || result.breaches.length > 0).toBe(true);
      }
    }
  });

  it('always reports a breach for every axis past its limit', () => {
    const random = generator(707);
    for (let i = 0; i < 300; i += 1) {
      const standard = randomLab(random);
      const lch = toLch(standard);
      const batch = fromLch({ L: lch.L + 2, C: lch.C, h: lch.h });
      const result = judge(block, standard, batch);
      expect(result.breaches.some((breach) => breach.axis === 'dL')).toBe(true);
    }
  });
});

describe('kubelka munk', () => {
  it('falls as reflectance rises, over the whole range', () => {
    let previous = Infinity;
    for (let r = 0.01; r <= 1; r += 0.01) {
      const value = kOverS(Number(r.toFixed(2)));
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('is never negative', () => {
    for (let r = 0.001; r <= 1; r += 0.013) {
      expect(kOverS(r)).toBeGreaterThanOrEqual(0);
    }
  });
});

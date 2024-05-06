import { describe, expect, it } from 'vitest';
import { fromLch, makeLab, toLch } from '../../src/colour/lab.js';
import {
  FORMULAE,
  deltaE,
  deltaE2000,
  deltaE76,
  deltaE94,
  deltaECmc,
  formulaNames,
} from '../../src/colour/deltae.js';

const standard = makeLab(52.1, -14.3, 22.7);

describe('every formula agrees on the easy cases', () => {
  it('reads zero for a batch on the standard', () => {
    for (const name of formulaNames()) {
      expect(deltaE(name, standard, standard)).toBeCloseTo(0, 9);
    }
  });

  it('never goes negative', () => {
    const batch = makeLab(49.2, -11.1, 25.4);
    for (const name of formulaNames()) {
      expect(deltaE(name, standard, batch)).toBeGreaterThan(0);
    }
  });

  it('grows as the batch moves further away', () => {
    for (const name of formulaNames()) {
      const near = deltaE(name, standard, makeLab(53.1, -14.3, 22.7));
      const far = deltaE(name, standard, makeLab(56.1, -14.3, 22.7));
      expect(far).toBeGreaterThan(near);
    }
  });

  it('names all four and refuses a fifth', () => {
    expect(formulaNames()).toEqual(['cie76', 'cie94', 'cmc', 'ciede2000']);
    expect(Object.keys(FORMULAE)).toHaveLength(4);
    expect(() => deltaE('cie2020', standard, standard)).toThrow(/unknown formula "cie2020"/);
  });
});

describe('cie 1976', () => {
  it('is a plain distance', () => {
    expect(deltaE76(makeLab(50, 0, 0), makeLab(53, 4, 0))).toBeCloseTo(5, 9);
  });

  it('is symmetric, which is the one thing it has going for it', () => {
    const a = makeLab(50, 2, 3);
    const b = makeLab(55, -1, 9);
    expect(deltaE76(a, b)).toBeCloseTo(deltaE76(b, a), 12);
  });
});

describe('cie 1994', () => {
  it('discounts a lightness difference against the textile weighting', () => {
    const lighter = makeLab(55.1, -14.3, 22.7);
    expect(deltaE94(standard, lighter)).toBeLessThan(deltaE76(standard, lighter));
    expect(deltaE94(standard, lighter)).toBeCloseTo(1.5, 6);
  });

  it('takes the graphic arts weighting when asked', () => {
    const lighter = makeLab(55.1, -14.3, 22.7);
    expect(deltaE94(standard, lighter, { kL: 1 })).toBeCloseTo(3, 6);
  });

  it('tightens on a dull colour and loosens on a bright one', () => {
    const dull = makeLab(50, 2, 2);
    const bright = makeLab(50, 60, 40);
    const shift = (lab) => makeLab(lab.L, lab.a + 1.5, lab.b);
    expect(deltaE94(dull, shift(dull))).toBeGreaterThan(deltaE94(bright, shift(bright)));
  });

  it('refuses a lightness weighting of zero', () => {
    expect(() => deltaE94(standard, standard, { kL: 0 })).toThrow(/kL/);
  });
});

describe('cmc two to one', () => {
  it('lets lightness move twice as far as chroma for the same number', () => {
    const lch = toLch(standard);
    const lighter = makeLab(standard.L + 1, standard.a, standard.b);
    const brighter = fromLch({ ...lch, C: lch.C + 1 });
    expect(deltaECmc(standard, lighter)).toBeLessThan(deltaECmc(standard, brighter));
  });

  it('collapses to one to one when the customer asks for it', () => {
    const lighter = makeLab(standard.L + 1, standard.a, standard.b);
    const two = deltaECmc(standard, lighter, { l: 2 });
    const one = deltaECmc(standard, lighter, { l: 1 });
    expect(one).toBeCloseTo(two * 2, 6);
  });

  it('uses the short lightness rule below sixteen', () => {
    const dark = makeLab(10, 1, -2);
    const darker = makeLab(11, 1, -2);
    expect(deltaECmc(dark, darker)).toBeCloseTo(1 / (2 * 0.511), 6);
  });

  it('switches hue weighting across the blue region', () => {
    const blue = makeLab(40, 5, -40);
    const orange = makeLab(40, 40, 30);
    const nudge = (lab) => makeLab(lab.L, lab.a + 0.8, lab.b + 0.8);
    expect(deltaECmc(blue, nudge(blue))).not.toBeCloseTo(deltaECmc(orange, nudge(orange)), 3);
  });

  it('refuses either weighting at zero', () => {
    expect(() => deltaECmc(standard, standard, { l: 0 })).toThrow(/l /);
    expect(() => deltaECmc(standard, standard, { c: 0 })).toThrow(/c /);
  });
});

describe('ciede2000', () => {
  it('matches the published sharma test pairs', () => {
    const cases = [
      [makeLab(50, 2.6772, -79.7751), makeLab(50, 0, -82.7485), 2.0425],
      [makeLab(50, 3.1571, -77.2803), makeLab(50, 0, -82.7485), 2.8615],
      [makeLab(50, 2.8361, -74.02), makeLab(50, 0, -82.7485), 3.4412],
      [makeLab(50, -1.3802, -84.2814), makeLab(50, 0, -82.7485), 1.0],
      [makeLab(50, 2.5, 0), makeLab(50, 0, -2.5), 4.3065],
      [makeLab(60.2574, -34.0099, 36.2677), makeLab(60.4626, -34.1751, 39.4387), 1.2644],
      [makeLab(2.0776, 0.0795, -1.135), makeLab(0.9033, -0.0636, -0.5514), 0.9082],
    ];
    for (const [a, b, expected] of cases) {
      expect(deltaE2000(a, b)).toBeCloseTo(expected, 3);
    }
  });

  it('is symmetric on the sharma pairs', () => {
    const a = makeLab(60.2574, -34.0099, 36.2677);
    const b = makeLab(60.4626, -34.1751, 39.4387);
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 6);
  });

  it('handles a neutral pair where hue is undefined', () => {
    expect(deltaE2000(makeLab(50, 0, 0), makeLab(51, 0, 0))).toBeGreaterThan(0);
    expect(Number.isFinite(deltaE2000(makeLab(50, 0, 0), makeLab(50, 0, 0)))).toBe(true);
  });
});

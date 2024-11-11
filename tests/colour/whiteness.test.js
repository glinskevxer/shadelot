import { describe, expect, it } from 'vitest';
import {
  VALID,
  WHITE_POINT,
  brightenerAdvice,
  ciewhiteness,
  isInsideFormula,
  judgeWhite,
  tint,
  tintDescription,
} from '../../src/colour/whiteness.js';

const perfect = { Y: 100, x: WHITE_POINT.x, y: WHITE_POINT.y };
const bleached = { Y: 91.4, x: 0.3134, y: 0.3302 };
const brightened = { Y: 92.8, x: 0.3086, y: 0.3244 };
const yellowish = { Y: 88.2, x: 0.3214, y: 0.3376 };

describe('the indices', () => {
  it('read a hundred for the perfect diffuser at the white point', () => {
    expect(ciewhiteness(perfect)).toBeCloseTo(100, 9);
    expect(tint(perfect)).toBeCloseTo(0, 9);
  });

  it('read higher for a brightened cloth than a bleached one', () => {
    expect(ciewhiteness(brightened)).toBeGreaterThan(ciewhiteness(bleached));
  });

  it('read lower for a yellow one', () => {
    expect(ciewhiteness(yellowish)).toBeLessThan(ciewhiteness(bleached));
  });

  it('take another white point when the instrument is set to one', () => {
    const shifted = ciewhiteness(bleached, { x: 0.32, y: 0.34 });
    expect(shifted).not.toBeCloseTo(ciewhiteness(bleached), 3);
  });

  it('refuse a reflectance off the scale', () => {
    expect(() => ciewhiteness({ Y: 140, x: 0.3, y: 0.3 })).toThrow(/Y/);
    expect(() => tint({ x: 'blue', y: 0.3 })).toThrow(/x/);
  });
});

describe('whether the formula applies', () => {
  it('passes an ordinary bleached white', () => {
    expect(isInsideFormula(bleached).inside).toBe(true);
  });

  it('names the bound a heavily brightened cloth broke', () => {
    const overdone = { Y: 95, x: 0.27, y: 0.29 };
    const check = isInsideFormula(overdone);
    expect(check.inside).toBe(false);
    expect(check.problems.join(' ')).toMatch(/whiteness of/);
  });

  it('names a low reflectance as its own problem', () => {
    const grey = { Y: 62, x: 0.3138, y: 0.331 };
    expect(isInsideFormula(grey).problems.join(' ')).toMatch(/Y of 62.0 is below 70/);
  });

  it('reports every bound that broke, not the first', () => {
    const wild = { Y: 40, x: 0.25, y: 0.28 };
    expect(isInsideFormula(wild).problems.length).toBeGreaterThan(1);
    expect(VALID.whiteness).toEqual([40, 160]);
  });
});

describe('the words the shade room uses', () => {
  it('calls a small tint neutral', () => {
    expect(tintDescription(0.2)).toBe('neutral');
    expect(tintDescription(-0.2)).toBe('neutral');
  });

  it('names the two directions', () => {
    expect(tintDescription(1.4)).toBe('greenish');
    expect(tintDescription(-1.4)).toBe('reddish');
  });

  it('takes a tighter threshold for a critical white', () => {
    expect(tintDescription(0.2, { threshold: 0.1 })).toBe('greenish');
    expect(() => tintDescription(0.2, { threshold: 0 })).toThrow(/threshold/);
  });
});

describe('judging a white', () => {
  it('passes a bleached white against a modest specification', () => {
    const result = judgeWhite(bleached, { minimumWhiteness: 80 });
    expect(result.verdict).toBe('pass');
    expect(result.breaches).toEqual([]);
  });

  it('fails one that is not white enough', () => {
    const result = judgeWhite(yellowish, { minimumWhiteness: 120 });
    expect(result.verdict).toBe('fail');
    expect(result.breaches[0].index).toBe('whiteness');
  });

  it('fails one that is too blue as well as one that is too yellow', () => {
    const blue = { Y: 94, x: 0.3, y: 0.318 };
    const result = judgeWhite(blue, { minimumWhiteness: 80, tintWindow: 0.5 });
    expect(result.breaches.some((breach) => breach.index === 'tint')).toBe(true);
  });

  it('says which way the tint reads', () => {
    expect(judgeWhite(bleached, { minimumWhiteness: 80 }).reads).toBeTypeOf('string');
  });

  it('says when the reading sits outside the formula, even on a pass', () => {
    const overdone = { Y: 95, x: 0.27, y: 0.29 };
    const result = judgeWhite(overdone, { minimumWhiteness: 80, tintWindow: 20 });
    expect(result.verdict).toBe('pass');
    expect(result.insideFormula).toBe(false);
  });

  it('refuses a specification nothing could mean', () => {
    expect(() => judgeWhite(bleached, { minimumWhiteness: 300 })).toThrow(/minimumWhiteness/);
    expect(() => judgeWhite(bleached, { minimumWhiteness: 80, tintWindow: 0 })).toThrow(
      /tintWindow/
    );
  });
});

describe('advising on the brightener', () => {
  const curve = [
    { dose: 0, whiteness: 82 },
    { dose: 0.2, whiteness: 104 },
    { dose: 0.4, whiteness: 128 },
    { dose: 0.6, whiteness: 140 },
    { dose: 0.8, whiteness: 138 },
  ];

  it('reads a dose off the rising part of the curve', () => {
    const advice = brightenerAdvice(104, 116, curve);
    expect(advice.possible).toBe(true);
    expect(advice.dose).toBeCloseTo(0.3, 6);
  });

  it('says no when the target sits above the peak', () => {
    const advice = brightenerAdvice(104, 150, curve);
    expect(advice.possible).toBe(false);
    expect(advice.reason).toMatch(/peaks at 140.0 at 0.6 percent/);
  });

  it('never reads a dose off the falling part', () => {
    expect(brightenerAdvice(104, 139, curve).dose).toBeLessThanOrEqual(0.6);
  });

  it('lands on the lowest dose for a target under the whole curve', () => {
    expect(brightenerAdvice(60, 70, curve).dose).toBe(0);
  });

  it('takes the curve in any order', () => {
    const shuffled = [...curve].reverse();
    expect(brightenerAdvice(104, 116, shuffled).dose).toBeCloseTo(0.3, 6);
  });

  it('refuses a curve of one point', () => {
    expect(() => brightenerAdvice(104, 116, [{ dose: 0, whiteness: 82 }])).toThrow(
      /at least two measured points/
    );
  });
});

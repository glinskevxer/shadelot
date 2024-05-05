import { describe, expect, it } from 'vitest';
import {
  chroma,
  describeDifference,
  fromLch,
  hueAngle,
  labDifference,
  lchDifference,
  makeLab,
  meanLab,
  toLch,
} from '../../src/colour/lab.js';

describe('lab and its polar form', () => {
  it('reads chroma as the distance from the neutral axis', () => {
    expect(chroma(makeLab(50, 3, 4))).toBeCloseTo(5, 9);
    expect(chroma(makeLab(50, 0, 0))).toBe(0);
  });

  it('puts hue in the half open circle', () => {
    expect(hueAngle(makeLab(50, 1, 0))).toBeCloseTo(0, 9);
    expect(hueAngle(makeLab(50, 0, 1))).toBeCloseTo(90, 9);
    expect(hueAngle(makeLab(50, -1, 0))).toBeCloseTo(180, 9);
    expect(hueAngle(makeLab(50, 0, -1))).toBeCloseTo(270, 9);
  });

  it('round trips through lch', () => {
    const lab = makeLab(42.7, -18.3, 24.9);
    const back = fromLch(toLch(lab));
    expect(back.L).toBeCloseTo(lab.L, 9);
    expect(back.a).toBeCloseTo(lab.a, 9);
    expect(back.b).toBeCloseTo(lab.b, 9);
  });

  it('refuses a reading with a missing channel', () => {
    expect(() => makeLab(50, 3, undefined)).toThrow(/b must be a finite number/);
    expect(() => fromLch({ L: 50, C: 5 })).toThrow(/h must be/);
  });
});

describe('differences', () => {
  const standard = makeLab(55, -12, 20);

  it('reads batch minus standard so a lighter batch is positive', () => {
    expect(labDifference(standard, makeLab(56, -12, 20)).dL).toBeCloseTo(1, 9);
    expect(labDifference(standard, makeLab(54, -12, 20)).dL).toBeCloseTo(-1, 9);
  });

  it('splits the ab movement into chroma and hue', () => {
    const brighter = fromLch({ ...toLch(standard), C: toLch(standard).C + 2 });
    const diff = lchDifference(standard, brighter);
    expect(diff.dC).toBeCloseTo(2, 6);
    expect(Math.abs(diff.dH)).toBeLessThan(1e-6);
  });

  it('gives hue a sign from the direction of the turn', () => {
    const anticlockwise = fromLch({ ...toLch(standard), h: toLch(standard).h + 3 });
    const clockwise = fromLch({ ...toLch(standard), h: toLch(standard).h - 3 });
    expect(lchDifference(standard, anticlockwise).dH).toBeGreaterThan(0);
    expect(lchDifference(standard, clockwise).dH).toBeLessThan(0);
  });

  it('keeps the total ab movement whichever way it is split', () => {
    const batch = makeLab(55, -10.5, 22.4);
    const { da, db } = labDifference(standard, batch);
    const { dC, dH } = lchDifference(standard, batch);
    expect(Math.hypot(dC, dH)).toBeCloseTo(Math.hypot(da, db), 9);
  });
});

describe('the plain english the card carries', () => {
  const standard = makeLab(55, -12, 20);

  it('says nothing when nothing moved', () => {
    expect(describeDifference(standard, makeLab(55.05, -12, 20))).toBe('on shade');
  });

  it('names lightness first', () => {
    expect(describeDifference(standard, makeLab(58, -12, 20))).toBe('lighter');
    expect(describeDifference(standard, makeLab(52, -12, 20))).toBe('darker');
  });

  it('calls a chroma drop dull', () => {
    const duller = fromLch({ ...toLch(standard), C: toLch(standard).C - 3 });
    expect(describeDifference(standard, duller)).toBe('duller');
  });

  it('joins the clauses when more than one axis moved', () => {
    const moved = fromLch({ L: 58, C: toLch(standard).C - 3, h: toLch(standard).h + 4 });
    expect(describeDifference(standard, moved)).toMatch(/lighter/);
    expect(describeDifference(standard, moved)).toMatch(/duller/);
    expect(describeDifference(standard, moved).split(', ')).toHaveLength(3);
  });

  it('takes a tighter threshold when the shade is critical', () => {
    expect(describeDifference(standard, makeLab(55.1, -12, 20), { threshold: 0.05 })).toBe(
      'lighter'
    );
  });
});

describe('averaging readings', () => {
  it('takes the mean channel by channel', () => {
    const mean = meanLab([makeLab(50, 2, 4), makeLab(52, 4, 6), makeLab(54, 0, 8)]);
    expect(mean.L).toBeCloseTo(52, 9);
    expect(mean.a).toBeCloseTo(2, 9);
    expect(mean.b).toBeCloseTo(6, 9);
  });

  it('refuses an empty set rather than returning black', () => {
    expect(() => meanLab([])).toThrow(/at least one reading/);
  });
});

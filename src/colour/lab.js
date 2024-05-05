/**
 * CIELAB and its polar form.
 *
 * The shade room reads LCh, not Lab. A dyer asked what is wrong with a batch
 * says it is duller and greener, which is chroma and hue, and translating that
 * back into a and b is the machine's job rather than theirs.
 */

import { requireNumber, requirePositive } from '../valid/guards.js';

export function makeLab(L, a, b) {
  requireNumber(L, 'L');
  requireNumber(a, 'a');
  requireNumber(b, 'b');
  return Object.freeze({ L, a, b });
}

export function chroma(lab) {
  return Math.hypot(lab.a, lab.b);
}

/** Hue angle in degrees, always in the half open interval zero to three sixty. */
export function hueAngle(lab) {
  const degrees = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

export function toLch(lab) {
  return Object.freeze({ L: lab.L, C: chroma(lab), h: hueAngle(lab) });
}

export function fromLch(lch) {
  requireNumber(lch.L, 'L');
  requireNumber(lch.C, 'C');
  requireNumber(lch.h, 'h');
  const radians = (lch.h * Math.PI) / 180;
  return makeLab(lch.L, lch.C * Math.cos(radians), lch.C * Math.sin(radians));
}

/**
 * The signed differences the shade room writes on a card. Sign convention is
 * batch minus standard throughout, so a positive dL is a lighter batch.
 */
export function labDifference(standard, batch) {
  return {
    dL: batch.L - standard.L,
    da: batch.a - standard.a,
    db: batch.b - standard.b,
  };
}

export function lchDifference(standard, batch) {
  const std = toLch(standard);
  const bat = toLch(batch);
  const { da, db } = labDifference(standard, batch);
  const dC = bat.C - std.C;
  const dLab = Math.hypot(da, db);
  const dHsquared = dLab * dLab - dC * dC;
  const magnitude = Math.sqrt(Math.max(0, dHsquared));
  const sign = standard.a * batch.b - standard.b * batch.a >= 0 ? 1 : -1;
  return { dL: bat.L - std.L, dC, dH: magnitude * sign };
}

/** The plain English the shade card carries, one clause per axis that moved. */
export function describeDifference(standard, batch, { threshold = 0.2 } = {}) {
  requirePositive(threshold, 'threshold');
  const { dL, dC, dH } = lchDifference(standard, batch);
  const notes = [];
  if (Math.abs(dL) >= threshold) notes.push(dL > 0 ? 'lighter' : 'darker');
  if (Math.abs(dC) >= threshold) notes.push(dC > 0 ? 'brighter' : 'duller');
  if (Math.abs(dH) >= threshold) notes.push(dH > 0 ? 'hue anticlockwise' : 'hue clockwise');
  return notes.length ? notes.join(', ') : 'on shade';
}

/** Mid point of two colours in Lab, used to average a set of readings. */
export function meanLab(colours) {
  if (!Array.isArray(colours) || colours.length === 0) {
    throw new RangeError('mean needs at least one reading');
  }
  const total = colours.reduce(
    (sum, lab) => ({ L: sum.L + lab.L, a: sum.a + lab.a, b: sum.b + lab.b }),
    { L: 0, a: 0, b: 0 }
  );
  const n = colours.length;
  return makeLab(total.L / n, total.a / n, total.b / n);
}

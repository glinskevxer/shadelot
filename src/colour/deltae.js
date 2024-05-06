/**
 * Colour difference formulae.
 *
 * Four of them are here because the trade has not settled on one and probably
 * never will. Customers write a tolerance in whichever formula their own quality
 * manual uses, and a batch passed under one and failed under another is a
 * conversation nobody wins by arguing about the arithmetic. Every formula takes
 * standard first and batch second.
 */

import { requirePositive } from '../valid/guards.js';
import { chroma, hueAngle, labDifference } from './lab.js';

const degrees = (radians) => (radians * 180) / Math.PI;
const radians = (deg) => (deg * Math.PI) / 180;

/** CIE 1976, which is a plain euclidean distance and flatters nothing. */
export function deltaE76(standard, batch) {
  const { dL, da, db } = labDifference(standard, batch);
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** CIE 1994, with the textile weightings rather than the graphic arts ones. */
export function deltaE94(standard, batch, { kL = 2, k1 = 0.048, k2 = 0.014 } = {}) {
  requirePositive(kL, 'kL');
  const { dL, da, db } = labDifference(standard, batch);
  const C1 = chroma(standard);
  const dC = C1 - chroma(batch);
  const dHsquared = da * da + db * db - dC * dC;
  const sL = 1;
  const sC = 1 + k1 * C1;
  const sH = 1 + k2 * C1;
  return Math.sqrt((dL / (kL * sL)) ** 2 + (dC / sC) ** 2 + Math.max(0, dHsquared) / (sH * sH));
}

/**
 * CMC(l:c), the one this dyehouse quotes by default. Two to one is the textile
 * setting: lightness is allowed twice the movement of chroma because the eye
 * forgives it on cloth.
 */
export function deltaECmc(standard, batch, { l = 2, c = 1 } = {}) {
  requirePositive(l, 'l');
  requirePositive(c, 'c');
  const { dL, da, db } = labDifference(standard, batch);
  const C1 = chroma(standard);
  const C2 = chroma(batch);
  const dC = C2 - C1;
  const dHsquared = Math.max(0, da * da + db * db - dC * dC);
  const h1 = hueAngle(standard);

  const sL = standard.L < 16 ? 0.511 : (0.040975 * standard.L) / (1 + 0.01765 * standard.L);
  const sC = (0.0638 * C1) / (1 + 0.0131 * C1) + 0.638;
  const f = Math.sqrt(C1 ** 4 / (C1 ** 4 + 1900));
  const t =
    h1 >= 164 && h1 <= 345
      ? 0.56 + Math.abs(0.2 * Math.cos(radians(h1 + 168)))
      : 0.36 + Math.abs(0.4 * Math.cos(radians(h1 + 35)));
  const sH = sC * (f * t + 1 - f);

  return Math.sqrt((dL / (l * sL)) ** 2 + (dC / (c * sC)) ** 2 + dHsquared / (sH * sH));
}

/** CIEDE2000, the current standard, kept for customers whose manual names it. */
export function deltaE2000(standard, batch, { kL = 1, kC = 1, kH = 1 } = {}) {
  const L1 = standard.L;
  const L2 = batch.L;
  const C1 = chroma(standard);
  const C2 = chroma(batch);
  const meanC = (C1 + C2) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const a1 = (1 + g) * standard.a;
  const a2 = (1 + g) * batch.a;
  const c1 = Math.hypot(a1, standard.b);
  const c2 = Math.hypot(a2, batch.b);
  const h1 = c1 === 0 ? 0 : hueAngle({ a: a1, b: standard.b });
  const h2 = c2 === 0 ? 0 : hueAngle({ a: a2, b: batch.b });

  const dL = L2 - L1;
  const dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(radians(dh) / 2);

  const meanL = (L1 + L2) / 2;
  const meanCprime = (c1 + c2) / 2;
  let meanH = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) > 180) meanH += h1 + h2 < 360 ? 360 : -360;
    meanH /= 2;
  }

  const t =
    1 -
    0.17 * Math.cos(radians(meanH - 30)) +
    0.24 * Math.cos(radians(2 * meanH)) +
    0.32 * Math.cos(radians(3 * meanH + 6)) -
    0.2 * Math.cos(radians(4 * meanH - 63));
  const sL = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const sC = 1 + 0.045 * meanCprime;
  const sH = 1 + 0.015 * meanCprime * t;
  const deltaTheta = 30 * Math.exp(-(((meanH - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(meanCprime ** 7 / (meanCprime ** 7 + 25 ** 7));
  const rT = -rC * Math.sin(2 * radians(deltaTheta));

  return Math.sqrt(
    (dL / (kL * sL)) ** 2 +
      (dC / (kC * sC)) ** 2 +
      (dH / (kH * sH)) ** 2 +
      rT * (dC / (kC * sC)) * (dH / (kH * sH))
  );
}

export const FORMULAE = Object.freeze({
  cie76: deltaE76,
  cie94: deltaE94,
  cmc: deltaECmc,
  ciede2000: deltaE2000,
});

export function formulaNames() {
  return Object.keys(FORMULAE);
}

export function deltaE(formula, standard, batch, options) {
  const fn = FORMULAE[formula];
  if (!fn) {
    throw new RangeError(
      `unknown formula "${formula}", expected one of ${formulaNames().join(', ')}`
    );
  }
  return fn(standard, batch, options);
}

export const helpers = Object.freeze({ degrees, radians });

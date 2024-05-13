import { describe, expect, it } from 'vitest';
import {
  BAND_COUNT,
  absorptionPeak,
  bandIndex,
  colourStrength,
  flatCurve,
  integratedStrength,
  kOverS,
  kOverSCurve,
  makeCurve,
  wavelengths,
} from '../../src/colour/reflectance.js';

const dip = (peakIndex, depth) =>
  makeCurve(
    Array.from({ length: BAND_COUNT }, (_, i) => {
      const distance = Math.abs(i - peakIndex);
      return Math.max(0.02, 0.65 - depth * Math.exp(-(distance ** 2) / 18));
    })
  );

describe('the band grid', () => {
  it('runs four hundred to seven hundred in tens', () => {
    const bands = wavelengths();
    expect(bands).toHaveLength(31);
    expect(bands[0]).toBe(400);
    expect(bands.at(-1)).toBe(700);
  });

  it('maps a wavelength to its index and refuses one off the grid', () => {
    expect(bandIndex(400)).toBe(0);
    expect(bandIndex(560)).toBe(16);
    expect(() => bandIndex(565)).toThrow(/steps of 10/);
    expect(() => bandIndex(720)).toThrow(/between 400 and 700/);
  });
});

describe('building a curve', () => {
  it('takes exactly the bands the instrument reports', () => {
    expect(flatCurve(0.5)).toHaveLength(31);
    expect(() => makeCurve(new Array(30).fill(0.5))).toThrow(/at least 31 entries/);
    expect(() => makeCurve(new Array(32).fill(0.5))).toThrow(/exactly 31 bands/);
  });

  it('names the wavelength when a band is out of range', () => {
    const values = new Array(31).fill(0.5);
    values[16] = 1.4;
    expect(() => makeCurve(values)).toThrow(/reflectance\[560\]/);
  });

  it('refuses a reflectance of zero, which kubelka munk cannot take', () => {
    const values = new Array(31).fill(0.5);
    values[0] = 0;
    expect(() => makeCurve(values)).toThrow(/reflectance\[400\]/);
  });

  it('is frozen so a stored curve cannot be edited in place', () => {
    expect(Object.isFrozen(flatCurve(0.4))).toBe(true);
  });
});

describe('kubelka munk', () => {
  it('is zero at full reflectance', () => {
    expect(kOverS(1)).toBe(0);
  });

  it('rises as the cloth gets darker', () => {
    expect(kOverS(0.2)).toBeGreaterThan(kOverS(0.5));
    expect(kOverS(0.05)).toBeGreaterThan(kOverS(0.2));
  });

  it('matches the closed form at a half', () => {
    expect(kOverS(0.5)).toBeCloseTo(0.25, 12);
  });

  it('runs the whole curve in one call', () => {
    expect(kOverSCurve(flatCurve(0.5))).toHaveLength(31);
    expect(kOverSCurve(flatCurve(0.5))[0]).toBeCloseTo(0.25, 12);
  });

  it('refuses a reflectance outside the physical range', () => {
    expect(() => kOverS(0)).toThrow(/reflectance/);
    expect(() => kOverS(1.2)).toThrow(/reflectance/);
  });
});

describe('finding the absorption peak', () => {
  it('is the lowest reflectance on the curve', () => {
    const peak = absorptionPeak(dip(16, 0.5));
    expect(peak.wavelength).toBe(560);
    expect(peak.index).toBe(16);
  });

  it('takes the first of two equal minima rather than the last', () => {
    const values = new Array(31).fill(0.5);
    values[4] = 0.1;
    values[20] = 0.1;
    expect(absorptionPeak(makeCurve(values)).wavelength).toBe(440);
  });

  it('lands anywhere on a flat curve without failing', () => {
    expect(absorptionPeak(flatCurve(0.42)).wavelength).toBe(400);
  });
});

describe('colour strength', () => {
  const standard = dip(16, 0.5);

  it('reads a hundred percent against itself', () => {
    expect(colourStrength(standard, standard)).toBeCloseTo(1, 9);
    expect(integratedStrength(standard, standard)).toBeCloseTo(1, 9);
  });

  it('reads under a hundred for a weak batch', () => {
    expect(colourStrength(standard, dip(16, 0.4))).toBeLessThan(1);
    expect(integratedStrength(standard, dip(16, 0.4))).toBeLessThan(1);
  });

  it('reads over a hundred for a heavy one', () => {
    expect(colourStrength(standard, dip(16, 0.58))).toBeGreaterThan(1);
  });

  it('reads at a named wavelength when the lab pins one', () => {
    const atPeak = colourStrength(standard, dip(16, 0.45));
    const atEdge = colourStrength(standard, dip(16, 0.45), { at: 420 });
    expect(atPeak).not.toBeCloseTo(atEdge, 4);
  });

  it('is steadier over the whole curve than at one band', () => {
    const noisy = dip(15, 0.5);
    const peakRead = colourStrength(standard, noisy);
    const wholeRead = integratedStrength(standard, noisy);
    expect(Math.abs(wholeRead - 1)).toBeLessThan(Math.abs(peakRead - 1));
  });

  it('refuses a wavelength that is not a band', () => {
    expect(() => colourStrength(standard, standard, { at: 555 })).toThrow(/wavelength/);
  });
});

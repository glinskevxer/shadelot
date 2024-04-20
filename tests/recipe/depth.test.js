import { describe, expect, it } from 'vitest';
import {
  DEPTH_BANDS,
  REFERENCE_LIQUOR_RATIO,
  alkaliForDepth,
  bandByName,
  bandNames,
  depthBand,
  depthProfile,
  saltForDepth,
} from '../../src/recipe/depth.js';

describe('the bands', () => {
  it('runs pale through heavy with no gap', () => {
    expect(bandNames()).toEqual(['pale', 'light', 'medium', 'dark', 'heavy']);
    expect(DEPTH_BANDS.at(-1).upTo).toBe(Infinity);
  });

  it('rises monotonically in both salt and alkali', () => {
    for (let i = 1; i < DEPTH_BANDS.length; i += 1) {
      expect(DEPTH_BANDS[i].saltGpl).toBeGreaterThan(DEPTH_BANDS[i - 1].saltGpl);
      expect(DEPTH_BANDS[i].alkaliGpl).toBeGreaterThan(DEPTH_BANDS[i - 1].alkaliGpl);
    }
  });

  it('is looked up by name and complains when it is not one', () => {
    expect(bandByName('medium').saltGpl).toBe(50);
    expect(() => bandByName('mid')).toThrow(/must be one of pale, light/);
  });
});

describe('placing a shade in a band', () => {
  it('takes the lower band on a boundary', () => {
    expect(depthBand(0.5).name).toBe('pale');
    expect(depthBand(0.500001).name).toBe('light');
    expect(depthBand(2).name).toBe('medium');
    expect(depthBand(4).name).toBe('dark');
  });

  it('puts a colourless bath in the palest band', () => {
    expect(depthBand(0).name).toBe('pale');
  });

  it('puts anything past the last boundary in the heaviest band', () => {
    expect(depthBand(9.9).name).toBe('heavy');
    expect(depthBand(120).name).toBe('heavy');
  });

  it('refuses a negative dye percentage', () => {
    expect(() => depthBand(-0.1)).toThrow(/must not be negative/);
  });
});

describe('electrolyte against the liquor ratio', () => {
  it('reads the works standard straight off at the reference ratio', () => {
    expect(REFERENCE_LIQUOR_RATIO).toBe(8);
    expect(saltForDepth(1.5, 8)).toBe(50);
    expect(alkaliForDepth(1.5, 8)).toBe(12);
  });

  it('halves the concentration when the bath is twice as long', () => {
    expect(saltForDepth(1.5, 16)).toBe(25);
    expect(alkaliForDepth(1.5, 16)).toBe(6);
  });

  it('raises it on a short bath', () => {
    expect(saltForDepth(1.5, 4)).toBe(100);
  });

  it('takes a works with a different reference ratio', () => {
    expect(saltForDepth(1.5, 10, { reference: 10 })).toBe(50);
  });

  it('refuses a ratio of zero rather than returning infinity', () => {
    expect(() => saltForDepth(1.5, 0)).toThrow(/liquorRatio/);
    expect(() => alkaliForDepth(1.5, 8, { reference: 0 })).toThrow(/reference/);
  });
});

describe('the profile a card prints', () => {
  it('carries the band name alongside the numbers', () => {
    const profile = depthProfile(2.5, 8);
    expect(profile).toEqual({
      band: 'dark',
      totalOwf: 2.5,
      liquorRatio: 8,
      saltGpl: 70,
      alkaliGpl: 18,
    });
  });

  it('scales the whole profile together', () => {
    const profile = depthProfile(2.5, 16);
    expect(profile.saltGpl).toBe(35);
    expect(profile.alkaliGpl).toBe(9);
    expect(profile.band).toBe('dark');
  });
});

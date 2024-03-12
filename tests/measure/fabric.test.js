import { describe, expect, it } from 'vitest';
import {
  gramsPerLinearMetre,
  gsmFromOuncesPerSquareYard,
  lotDryMass,
  ouncesPerSquareYardFromGsm,
  rollArea,
  rollDryMass,
  rollMass,
} from '../../src/measure/fabric.js';

describe('roll area and mass', () => {
  it('multiplies out a plain roll', () => {
    expect(rollArea(120, 1.5)).toBeCloseTo(180, 9);
    expect(rollMass(180, 180)).toBeCloseTo(32.4, 9);
  });

  it('refuses a zero or negative dimension rather than returning zero mass', () => {
    expect(() => rollArea(0, 1.5)).toThrow(/length must be a positive/);
    expect(() => rollArea(120, -1)).toThrow(/width must be a positive/);
    expect(() => rollMass(180, 0)).toThrow(/gsm must be a positive/);
  });
});

describe('the ounce and gram forms of areal density', () => {
  it('converts a six ounce twill to the number the floor works in', () => {
    expect(gsmFromOuncesPerSquareYard(6)).toBeCloseTo(203.4345, 3);
  });

  it('goes back again without drift', () => {
    const gsm = gsmFromOuncesPerSquareYard(4.5);
    expect(ouncesPerSquareYardFromGsm(gsm)).toBeCloseTo(4.5, 10);
  });

  it('refuses a non positive density in either direction', () => {
    expect(() => gsmFromOuncesPerSquareYard(0)).toThrow(RangeError);
    expect(() => ouncesPerSquareYardFromGsm(-12)).toThrow(RangeError);
  });
});

describe('linear density', () => {
  it('is the areal density across the cuttable width', () => {
    expect(gramsPerLinearMetre(220, 1.8)).toBeCloseTo(396, 9);
  });
});

describe('dry mass off a docket', () => {
  it('reads a metric docket', () => {
    const mass = rollDryMass({ length: 100, widthCm: 150, gsm: 200 });
    expect(mass).toBeCloseTo(30, 9);
  });

  it('reads a docket written in yards', () => {
    const mass = rollDryMass({ length: 100, lengthUnit: 'yd', widthCm: 150, gsm: 200 });
    expect(mass).toBeCloseTo(27.432, 6);
  });

  it('adds a lot up roll by roll', () => {
    const rolls = [
      { length: 100, widthCm: 150, gsm: 200 },
      { length: 80, widthCm: 150, gsm: 200 },
      { length: 60, widthCm: 148, gsm: 205 },
    ];
    expect(lotDryMass(rolls)).toBeCloseTo(30 + 24 + 18.204, 6);
  });

  it('will not total an empty lot', () => {
    expect(() => lotDryMass([])).toThrow(/at least one roll/);
    expect(() => lotDryMass(null)).toThrow(/at least one roll/);
  });
});

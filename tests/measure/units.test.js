import { describe, expect, it } from 'vitest';
import {
  convertLength,
  convertMass,
  convertVolume,
  factors,
  lengthUnits,
  massUnits,
  toKilograms,
  toLitres,
  toMetres,
  volumeUnits,
} from '../../src/measure/units.js';

describe('mass conversion', () => {
  it('holds the pound exactly as the international definition', () => {
    expect(convertMass(1, 'lb', 'kg')).toBe(factors.KILOGRAMS_PER_POUND);
  });

  it('round trips through the base unit without drift worth seeing', () => {
    const back = convertMass(convertMass(420.5, 'kg', 'lb'), 'lb', 'kg');
    expect(back).toBeCloseTo(420.5, 9);
  });

  it('reads grams and ounces off the same table', () => {
    expect(convertMass(1000, 'g', 'kg')).toBeCloseTo(1, 12);
    expect(convertMass(16, 'oz', 'lb')).toBeCloseTo(1, 12);
  });

  it('refuses a unit it does not carry and says what it does carry', () => {
    expect(() => convertMass(1, 'stone', 'kg')).toThrow(/unknown mass unit "stone"/);
    expect(() => convertMass(1, 'kg', 'grain')).toThrow(/expected one of kg, g, lb, oz/);
  });

  it('refuses anything that is not a finite number', () => {
    expect(() => convertMass(Number.NaN, 'kg', 'lb')).toThrow(TypeError);
    expect(() => convertMass(Infinity, 'kg', 'lb')).toThrow(/finite number/);
    expect(() => convertMass('12', 'kg', 'lb')).toThrow(/received 12/);
  });
});

describe('length conversion', () => {
  it('uses the yard the textile trade uses', () => {
    expect(convertLength(1, 'yd', 'm')).toBe(factors.METRES_PER_YARD);
    expect(convertLength(36, 'in', 'yd')).toBeCloseTo(1, 12);
  });

  it('converts a roll length both ways', () => {
    expect(toMetres(150, 'yd')).toBeCloseTo(137.16, 6);
    expect(convertLength(137.16, 'm', 'yd')).toBeCloseTo(150, 6);
  });
});

describe('volume conversion', () => {
  it('knows the US gallon a chemical drum is labelled in', () => {
    expect(convertVolume(1, 'galUS', 'l')).toBe(factors.LITRES_PER_US_GALLON);
  });

  it('takes millilitres for a lab dip', () => {
    expect(toLitres(250, 'ml')).toBeCloseTo(0.25, 12);
  });
});

describe('unit listings', () => {
  it('names every unit the tables carry', () => {
    expect(massUnits()).toEqual(['kg', 'g', 'lb', 'oz']);
    expect(lengthUnits()).toEqual(['m', 'cm', 'mm', 'yd', 'in']);
    expect(volumeUnits()).toEqual(['l', 'ml', 'galUS']);
  });

  it('keeps the factor table frozen so nothing rewrites a constant at runtime', () => {
    expect(Object.isFrozen(factors)).toBe(true);
  });
});

describe('the base unit shorthands', () => {
  it('agree with the general converter', () => {
    expect(toKilograms(220, 'lb')).toBe(convertMass(220, 'lb', 'kg'));
    expect(toMetres(80, 'yd')).toBe(convertLength(80, 'yd', 'm'));
  });
});

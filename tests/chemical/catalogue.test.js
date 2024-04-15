import { describe, expect, it } from 'vitest';
import {
  DEPTH_DRIVEN,
  DOSE_BASIS,
  ROLES,
  activeCharge,
  byRole,
  chemicalCharge,
  createChemicalStore,
  findChemical,
  makeChemical,
} from '../../src/chemical/catalogue.js';

const salt = makeChemical({
  code: 'NACL-IND',
  name: 'Industrial common salt',
  role: 'salt',
  basis: 'gpl',
  pricePerKg: 0.12,
  maxDose: 100,
});

const soda = makeChemical({
  code: 'NA2CO3',
  name: 'Soda ash light',
  role: 'alkali',
  basis: 'gpl',
  pricePerKg: 0.42,
  activePercent: 99.2,
});

const wetter = makeChemical({
  code: 'WET-4',
  name: 'Low foam wetting agent',
  role: 'wetting',
  basis: 'owf',
  pricePerKg: 3.4,
  codLoad: 1.4,
});

describe('making a chemical', () => {
  it('records which of the two bases it is dosed on', () => {
    expect(DOSE_BASIS).toEqual(['owf', 'gpl']);
    expect(salt.basis).toBe('gpl');
    expect(wetter.basis).toBe('owf');
  });

  it('marks the roles the depth of shade sets rather than the author', () => {
    expect(DEPTH_DRIVEN).toEqual(['salt', 'alkali']);
    expect(salt.depthDriven).toBe(true);
    expect(wetter.depthDriven).toBe(false);
  });

  it('assumes fully active unless told otherwise', () => {
    expect(wetter.activePercent).toBe(100);
    expect(soda.activePercent).toBe(99.2);
  });

  it('refuses a purity above a hundred', () => {
    expect(() => makeChemical({ ...wetter, code: 'X', activePercent: 101 })).toThrow(
      /cannot exceed a hundred/
    );
  });

  it('refuses a role nothing on this floor plays', () => {
    expect(() => makeChemical({ ...wetter, code: 'X', role: 'fragrance' })).toThrow(
      /chemical.role/
    );
    expect(ROLES).toContain('sequestrant');
  });

  it('assumes no effluent load until one is measured', () => {
    expect(salt.codLoad).toBe(0);
    expect(wetter.codLoad).toBe(1.4);
  });
});

describe('the chemical store', () => {
  const store = createChemicalStore([salt, soda, wetter]);

  it('finds by code and says so when it cannot', () => {
    expect(findChemical(store, 'NA2CO3').name).toBe('Soda ash light');
    expect(() => findChemical(store, 'NAOH')).toThrow(/not in the chemical store/);
  });

  it('refuses a duplicate code', () => {
    expect(() => createChemicalStore([salt, salt])).toThrow(/appears twice/);
  });

  it('lists a role', () => {
    expect(byRole(store, 'alkali').map((c) => c.code)).toEqual(['NA2CO3']);
    expect(byRole(store, 'softener')).toEqual([]);
    expect(() => byRole(store, 'perfume')).toThrow(/role/);
  });
});

describe('working out a charge', () => {
  it('reads the fibre weight for a percent on weight dose', () => {
    expect(chemicalCharge(wetter, 1.5, { fibreKg: 200, liquorLitres: 1600 })).toBeCloseTo(3, 9);
  });

  it('reads the liquor for a grams per litre dose', () => {
    expect(chemicalCharge(salt, 60, { fibreKg: 200, liquorLitres: 1600 })).toBeCloseTo(96, 9);
  });

  it('ignores the input the basis does not use', () => {
    const a = chemicalCharge(wetter, 1.5, { fibreKg: 200, liquorLitres: 1600 });
    const b = chemicalCharge(wetter, 1.5, { fibreKg: 200, liquorLitres: 40000 });
    expect(a).toBe(b);
  });

  it('needs the input the basis does use', () => {
    expect(() => chemicalCharge(salt, 60, { fibreKg: 200 })).toThrow(/liquorLitres/);
    expect(() => chemicalCharge(wetter, 1.5, { liquorLitres: 1600 })).toThrow(/fibreKg/);
  });

  it('stops at a published ceiling and names the chemical', () => {
    expect(() => chemicalCharge(salt, 140, { liquorLitres: 1600 })).toThrow(
      /exceeds the 100 ceiling for NACL-IND/
    );
  });

  it('lets a chemical with no ceiling through', () => {
    expect(chemicalCharge(soda, 400, { liquorLitres: 1000 })).toBeCloseTo(400, 9);
  });

  it('converts a charge to the active substance the chemistry sees', () => {
    expect(activeCharge(soda, 20)).toBeCloseTo(19.84, 9);
    expect(activeCharge(wetter, 3)).toBe(3);
  });
});

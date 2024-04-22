import { describe, expect, it } from 'vitest';
import { createCatalogue, makeDyestuff } from '../../src/dyestuff/catalogue.js';
import { createChemicalStore, makeChemical } from '../../src/chemical/catalogue.js';
import { PROCESSES, dyeShares, hasRole, makeRecipe, shadeFamily } from '../../src/recipe/recipe.js';

const catalogue = createCatalogue([
  makeDyestuff({
    code: 'RY-145',
    name: 'Yellow',
    supplier: 'Acme',
    dyeClass: 'reactive',
    pricePerKg: 20,
  }),
  makeDyestuff({
    code: 'RR-195',
    name: 'Red',
    supplier: 'Acme',
    dyeClass: 'reactive',
    pricePerKg: 26,
  }),
  makeDyestuff({
    code: 'RB-19',
    name: 'Blue',
    supplier: 'Acme',
    dyeClass: 'reactive',
    pricePerKg: 24,
    maxOwf: 3,
  }),
  makeDyestuff({
    code: 'DB-56',
    name: 'Navy',
    supplier: 'Acme',
    dyeClass: 'disperse',
    pricePerKg: 18,
  }),
]);

const chemicals = createChemicalStore([
  makeChemical({ code: 'WET-4', name: 'Wetter', role: 'wetting', basis: 'owf', pricePerKg: 3 }),
  makeChemical({
    code: 'SEQ-2',
    name: 'Sequestrant',
    role: 'sequestrant',
    basis: 'gpl',
    pricePerKg: 4,
  }),
]);

const base = {
  id: 'R25-00081',
  name: 'Kestrel olive',
  process: 'exhaust',
  substrate: 'cotton woven',
  liquorRatio: 8,
  dyes: [
    { code: 'RY-145', owf: 0.9 },
    { code: 'RR-195', owf: 0.3 },
    { code: 'RB-19', owf: 0.6 },
  ],
  auxiliaries: [
    { code: 'WET-4', dose: 1 },
    { code: 'SEQ-2', dose: 0.5 },
  ],
};

const build = (extra = {}) => makeRecipe({ ...base, ...extra }, { catalogue, chemicals });

describe('building a recipe', () => {
  it('adds the dyes up and places the result in a band', () => {
    const recipe = build();
    expect(recipe.totalOwf).toBeCloseTo(1.8, 9);
    expect(recipe.band).toBe('medium');
    expect(recipe.dyeClass).toBe('reactive');
  });

  it('copies the basis and role off the chemical store rather than the recipe text', () => {
    const recipe = build();
    expect(recipe.auxiliaries[0]).toEqual({
      code: 'WET-4',
      dose: 1,
      basis: 'owf',
      role: 'wetting',
    });
    expect(recipe.auxiliaries[1].basis).toBe('gpl');
  });

  it('takes a recipe with no auxiliaries at all', () => {
    expect(build({ auxiliaries: undefined }).auxiliaries).toEqual([]);
  });

  it('refuses to mix two dye classes in one bath', () => {
    expect(() =>
      build({
        dyes: [
          { code: 'RY-145', owf: 1 },
          { code: 'DB-56', owf: 1 },
        ],
      })
    ).toThrow(/mixes the classes disperse and reactive/);
  });

  it('refuses the same dye or the same chemical listed twice', () => {
    expect(() =>
      build({
        dyes: [
          { code: 'RY-145', owf: 1 },
          { code: 'RY-145', owf: 0.2 },
        ],
      })
    ).toThrow(/appears twice in one recipe/);
    expect(() =>
      build({
        auxiliaries: [
          { code: 'WET-4', dose: 1 },
          { code: 'WET-4', dose: 2 },
        ],
      })
    ).toThrow(/appears twice in one recipe/);
  });

  it('holds each dye to the ceiling on its own article', () => {
    expect(() => build({ dyes: [{ code: 'RB-19', owf: 3.5 }] })).toThrow(
      /exceeds the 3 percent ceiling/
    );
    expect(build({ dyes: [{ code: 'RB-19', owf: 3 }] }).totalOwf).toBe(3);
  });

  it('refuses a dye or a chemical that is not stocked', () => {
    expect(() => build({ dyes: [{ code: 'RX-1', owf: 1 }] })).toThrow(/not in the catalogue/);
    expect(() => build({ auxiliaries: [{ code: 'NOPE', dose: 1 }] })).toThrow(
      /not in the chemical store/
    );
  });

  it('needs a process it can actually run', () => {
    expect(PROCESSES).toContain('pad-batch');
    expect(() => build({ process: 'screen-print' })).toThrow(/recipe.process/);
  });

  it('needs at least one dye', () => {
    expect(() => build({ dyes: [] })).toThrow(/at least 1 entries/);
  });

  it('is frozen down to the dye list', () => {
    const recipe = build();
    expect(Object.isFrozen(recipe)).toBe(true);
    expect(Object.isFrozen(recipe.dyes)).toBe(true);
    expect(Object.isFrozen(recipe.dyes[0])).toBe(true);
  });
});

describe('shares and families', () => {
  it('quotes each dye as a share of the whole', () => {
    const shares = dyeShares(build());
    expect(shares.map((s) => s.code)).toEqual(['RY-145', 'RR-195', 'RB-19']);
    expect(shares[0].share).toBeCloseTo(0.5, 9);
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 9);
  });

  it('gives two depths of the same shade the same family', () => {
    const half = build({
      id: 'R25-00082',
      dyes: [
        { code: 'RY-145', owf: 0.45 },
        { code: 'RR-195', owf: 0.15 },
        { code: 'RB-19', owf: 0.3 },
      ],
    });
    expect(shadeFamily(half)).toBe(shadeFamily(build()));
    expect(half.band).not.toBe(build().band);
  });

  it('gives a different ratio a different family', () => {
    const other = build({
      id: 'R25-00083',
      dyes: [
        { code: 'RY-145', owf: 0.6 },
        { code: 'RR-195', owf: 0.6 },
        { code: 'RB-19', owf: 0.6 },
      ],
    });
    expect(shadeFamily(other)).not.toBe(shadeFamily(build()));
  });

  it('answers whether a role is present at all', () => {
    expect(hasRole(build(), 'wetting')).toBe(true);
    expect(hasRole(build(), 'softener')).toBe(false);
  });
});

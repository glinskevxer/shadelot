import { describe, expect, it } from 'vitest';
import { createCatalogue, makeDyestuff } from '../../src/dyestuff/catalogue.js';
import { createChemicalStore, makeChemical } from '../../src/chemical/catalogue.js';
import { makeRecipe } from '../../src/recipe/recipe.js';
import { buildCard, liquorVolume, roundingDrift } from '../../src/recipe/card.js';

const catalogue = createCatalogue([
  makeDyestuff({
    code: 'RY-145',
    name: 'Yellow',
    supplier: 'Acme',
    dyeClass: 'reactive',
    pricePerKg: 20,
  }),
  makeDyestuff({
    code: 'RB-19',
    name: 'Blue',
    supplier: 'Acme',
    dyeClass: 'reactive',
    pricePerKg: 24,
  }),
]);

const chemicals = createChemicalStore([
  makeChemical({ code: 'NACL', name: 'Salt', role: 'salt', basis: 'gpl', pricePerKg: 0.12 }),
  makeChemical({ code: 'SODA', name: 'Soda ash', role: 'alkali', basis: 'gpl', pricePerKg: 0.42 }),
  makeChemical({ code: 'WET-4', name: 'Wetter', role: 'wetting', basis: 'owf', pricePerKg: 3 }),
]);

const recipe = makeRecipe(
  {
    id: 'R25-00081',
    name: 'Kestrel olive',
    process: 'exhaust',
    substrate: 'cotton woven',
    liquorRatio: 8,
    dyes: [
      { code: 'RY-145', owf: 1.2 },
      { code: 'RB-19', owf: 0.6 },
    ],
    auxiliaries: [{ code: 'WET-4', dose: 1 }],
  },
  { catalogue, chemicals }
);

const context = { catalogue, chemicals, saltCode: 'NACL', alkaliCode: 'SODA' };

describe('bath volume', () => {
  it('is the load times the ratio', () => {
    expect(liquorVolume(200, 8)).toBe(1600);
  });

  it('refuses a load or a ratio of zero', () => {
    expect(() => liquorVolume(0, 8)).toThrow(/fibreKg/);
    expect(() => liquorVolume(200, 0)).toThrow(/liquorRatio/);
  });
});

describe('the card', () => {
  const card = buildCard(recipe, 200, context);

  it('scales the dyes onto the load before it rounds them', () => {
    const yellow = card.lines.find((l) => l.code === 'RY-145');
    expect(yellow.exactKg).toBeCloseTo(2.4, 9);
    expect(yellow.kg).toBe(2.4);
    expect(card.dyeKg).toBeCloseTo(3.6, 9);
  });

  it('works the electrolyte out of the depth band, not off the recipe', () => {
    const salt = card.lines.find((l) => l.code === 'NACL');
    expect(card.band).toBe('medium');
    expect(salt.dose).toBe(50);
    expect(salt.exactKg).toBeCloseTo(80, 9);
  });

  it('doses a percent on weight auxiliary off the fibre and not the bath', () => {
    const wetter = card.lines.find((l) => l.code === 'WET-4');
    expect(wetter.basis).toBe('owf');
    expect(wetter.exactKg).toBeCloseTo(2, 9);
  });

  it('puts the dyes first, then the electrolyte, then the rest', () => {
    expect(card.lines.map((l) => l.kind)).toEqual([
      'dye',
      'dye',
      'electrolyte',
      'electrolyte',
      'auxiliary',
    ]);
  });

  it('names a balance for every line', () => {
    for (const line of card.lines) {
      expect(line.balance).toBeTruthy();
    }
  });

  it('carries the bath volume and the recipe it came from', () => {
    expect(card.litres).toBe(1600);
    expect(card.recipeId).toBe('R25-00081');
  });
});

describe('a card without a works electrolyte', () => {
  it('leaves the lines out rather than dosing a chemical it was not given', () => {
    const card = buildCard(recipe, 200, { catalogue, chemicals });
    expect(card.lines.some((l) => l.kind === 'electrolyte')).toBe(false);
    expect(card.lines).toHaveLength(3);
  });

  it('still dispenses the alkali when only that one is named', () => {
    const card = buildCard(recipe, 200, { catalogue, chemicals, alkaliCode: 'SODA' });
    const electrolyte = card.lines.filter((l) => l.kind === 'electrolyte');
    expect(electrolyte).toHaveLength(1);
    expect(electrolyte[0].role).toBe('alkali');
  });
});

describe('a small load', () => {
  it('drops to a finer balance rather than rounding a trace dye to nothing', () => {
    const trace = makeRecipe(
      { ...recipe, id: 'R25-1', dyes: [{ code: 'RB-19', owf: 0.02 }], auxiliaries: [] },
      { catalogue, chemicals }
    );
    const card = buildCard(trace, 12, context);
    const blue = card.lines.find((l) => l.code === 'RB-19');
    expect(blue.kg).toBeGreaterThan(0);
    expect(blue.balance).toBe('analytical');
  });

  it('keeps every line inside the rounding tolerance it was given', () => {
    const card = buildCard(recipe, 37.5, { ...context, tolerance: 0.01 });
    for (const { drift } of roundingDrift(card)) {
      expect(Math.abs(drift)).toBeLessThanOrEqual(0.01);
    }
  });

  it('refuses a load of zero', () => {
    expect(() => buildCard(recipe, 0, context)).toThrow(/fibreKg/);
  });
});

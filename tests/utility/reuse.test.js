import { describe, expect, it } from 'vitest';
import { createCatalogue, makeDyestuff } from '../../src/dyestuff/catalogue.js';
import { createChemicalStore } from '../../src/chemical/catalogue.js';
import { makeRecipe } from '../../src/recipe/recipe.js';
import {
  DEFAULTS,
  VERDICTS,
  assessReuse,
  correctedCharge,
  requireVerdict,
  residual,
  reuseChain,
  savingFrom,
  settingsFrom,
} from '../../src/utility/reuse.js';

const catalogue = createCatalogue([
  makeDyestuff({ code: 'Y', name: 'Yellow', supplier: 'A', dyeClass: 'reactive', pricePerKg: 20 }),
  makeDyestuff({ code: 'B', name: 'Blue', supplier: 'A', dyeClass: 'reactive', pricePerKg: 24 }),
  makeDyestuff({ code: 'D', name: 'Navy', supplier: 'A', dyeClass: 'disperse', pricePerKg: 18 }),
]);
const chemicals = createChemicalStore([]);

const build = (id, dyes) =>
  makeRecipe(
    { id, name: id, process: 'exhaust', substrate: 'cotton', liquorRatio: 8, dyes },
    { catalogue, chemicals }
  );

const pale = build('R1', [
  { code: 'Y', owf: 0.6 },
  { code: 'B', owf: 0.4 },
]);
const dark = build('R2', [
  { code: 'Y', owf: 1.5 },
  { code: 'B', owf: 1 },
]);
const other = build('R3', [
  { code: 'Y', owf: 2 },
  { code: 'B', owf: 0.2 },
]);
const disperse = build('R4', [{ code: 'D', owf: 2 }]);

describe('what is left in the bath', () => {
  it('keeps most of the salt and some of the dye', () => {
    const left = residual({ litres: 1600, saltGpl: 50, alkaliGpl: 12, dyeOwf: 1 });
    expect(left.saltGpl).toBeCloseTo(42.5, 9);
    expect(left.dyeOwf).toBeCloseTo(0.25 * 0.6, 9);
  });

  it('leaves more dye behind at a lower fixation', () => {
    const poor = residual(
      { litres: 1600, saltGpl: 50, alkaliGpl: 12, dyeOwf: 1 },
      { fixation: 0.4 }
    );
    expect(poor.dyeOwf).toBeGreaterThan(0.15);
  });

  it('refuses a bath of no volume', () => {
    expect(() => residual({ litres: 0, saltGpl: 50, alkaliGpl: 12, dyeOwf: 1 })).toThrow(/litres/);
  });
});

describe('whether to reuse', () => {
  it('reuses going darker inside a family', () => {
    expect(assessReuse(pale, dark).verdict).toBe('reuse');
  });

  it('drops when the class changes', () => {
    expect(assessReuse(pale, disperse).reason).toMatch(/dye class changes/);
  });

  it('drops when the family changes, however much darker', () => {
    expect(assessReuse(pale, other).reason).toMatch(/not in one family/);
  });

  it('drops when the next shade is not enough darker', () => {
    const slightly = build('R5', [
      { code: 'Y', owf: 0.63 },
      { code: 'B', owf: 0.42 },
    ]);
    expect(assessReuse(pale, slightly).reason).toMatch(/not enough darker/);
  });

  it('drops once the bath has been round enough times', () => {
    expect(assessReuse({ ...pale, reuses: 3 }, dark).reason).toMatch(/already been reused 3 times/);
  });

  it('puts the reuse count ahead of everything else', () => {
    expect(assessReuse({ ...pale, reuses: 5 }, disperse).reason).toMatch(/already been reused/);
  });

  it('asks for a correction when the bath already carries dye', () => {
    const result = assessReuse(pale, dark, { residualDyeOwf: 0.15 });
    expect(result.verdict).toBe('reuse-with-correction');
    expect(result.reason).toMatch(/take it off the charge/);
  });

  it('names the three verdicts and refuses a fourth', () => {
    expect(VERDICTS).toEqual(['reuse', 'reuse-with-correction', 'drop']);
    expect(requireVerdict('drop')).toBe('drop');
    expect(() => requireVerdict('maybe')).toThrow(/verdict/);
  });
});

describe('the corrected charge', () => {
  it('takes the residual off every dye in proportion', () => {
    const charge = correctedCharge(dark, 0.25);
    expect(charge[0].owf).toBeCloseTo(1.5 * 0.9, 9);
    expect(charge[0].fromBath).toBeCloseTo(0.15, 9);
  });

  it('adds back up to the recipe', () => {
    for (const line of correctedCharge(dark, 0.25)) {
      expect(line.owf + line.fromBath).toBeGreaterThan(0);
    }
    const total = correctedCharge(dark, 0.25).reduce(
      (sum, line) => sum + line.owf + line.fromBath,
      0
    );
    expect(total).toBeCloseTo(dark.totalOwf, 9);
  });

  it('is the recipe itself when the bath carries nothing', () => {
    expect(correctedCharge(dark, 0)[0].owf).toBeCloseTo(1.5, 9);
  });

  it('refuses a residual bigger than the recipe', () => {
    expect(() => correctedCharge(dark, 5)).toThrow(/residualDyeOwf/);
  });
});

describe('what a reuse saves', () => {
  it('counts the water and the salt', () => {
    const saving = savingFrom({ litres: 1600, saltGpl: 42.5 });
    expect(saving.waterM3).toBeCloseTo(1.6, 9);
    expect(saving.saltKg).toBeCloseTo(68, 9);
    expect(saving.value).toBeGreaterThan(0);
  });

  it('rises with the price of water', () => {
    const cheap = savingFrom({ litres: 1600, saltGpl: 42.5 }, { waterPerCubicMetre: 1 });
    const dear = savingFrom({ litres: 1600, saltGpl: 42.5 }, { waterPerCubicMetre: 3 });
    expect(dear.value).toBeGreaterThan(cheap.value);
  });
});

describe('a chain of reuses', () => {
  it('runs while the shades keep getting darker in one family', () => {
    const darker = build('R6', [
      { code: 'Y', owf: 3 },
      { code: 'B', owf: 2 },
    ]);
    expect(reuseChain([pale, dark, darker])).toEqual(['R1', 'R2', 'R6']);
  });

  it('stops at the first batch that cannot go in', () => {
    expect(reuseChain([pale, dark, other])).toEqual(['R1', 'R2']);
  });

  it('stops at the reuse limit even in one family', () => {
    const shades = [0.4, 0.7, 1.2, 2.1, 3.6, 6].map((depth, i) =>
      build(`S${i}`, [
        { code: 'Y', owf: depth * 0.6 },
        { code: 'B', owf: depth * 0.4 },
      ])
    );
    expect(reuseChain(shades).length).toBeLessThanOrEqual(DEFAULTS.maximumReuses + 1);
  });

  it('is one batch long when the second cannot follow the first', () => {
    expect(reuseChain([pale, disperse])).toEqual(['R1']);
  });
});

describe('the settings', () => {
  it('fill in from the works defaults', () => {
    expect(settingsFrom({}).maximumReuses).toBe(DEFAULTS.maximumReuses);
    expect(settingsFrom({ maximumReuses: 5 }).maximumReuses).toBe(5);
  });

  it('refuse anything that is not a positive number', () => {
    expect(() => settingsFrom({ saltRecovery: 0 })).toThrow(/settings.saltRecovery/);
    expect(() => settingsFrom({ maximumReuses: 'lots' })).toThrow(/settings.maximumReuses/);
  });
});

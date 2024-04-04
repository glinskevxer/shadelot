import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  CLASS_FIBRES,
  FASTNESS_TESTS,
  createCatalogue,
  dyesFor,
  find,
  makeDyestuff,
  sameColourIndex,
} from '../../src/dyestuff/catalogue.js';

const base = {
  code: 'RB-19-ACME',
  name: 'Brilliant Blue RR',
  supplier: 'Acme Colours',
  dyeClass: 'reactive',
  colourIndex: 'rb19',
  pricePerKg: 24.5,
};

describe('making a dyestuff', () => {
  it('defaults the strength to a hundred and the ceiling to eight percent', () => {
    const dye = makeDyestuff(base);
    expect(dye.strength).toBe(100);
    expect(dye.maxOwf).toBe(8);
  });

  it('upper cases the colour index so two spellings match', () => {
    expect(makeDyestuff(base).colourIndex).toBe('RB19');
  });

  it('fills the fibres from the class rather than trusting the caller', () => {
    expect(makeDyestuff(base).fibres).toEqual(['cotton', 'viscose', 'wool']);
    expect(makeDyestuff({ ...base, dyeClass: 'disperse' }).fibres).toEqual([
      'polyester',
      'acrylic',
    ]);
  });

  it('refuses a class this floor cannot run', () => {
    expect(() => makeDyestuff({ ...base, dyeClass: 'sulphur' })).toThrow(/dyeClass/);
    expect(CLASSES).toHaveLength(6);
    expect(Object.keys(CLASS_FIBRES)).toEqual(CLASSES);
  });

  it('keeps light fastness on the eight point scale and the rest on five', () => {
    const dye = makeDyestuff({ ...base, fastness: { light: 7, wash: 4, rubWet: 3 } });
    expect(dye.fastness).toEqual({ wash: 4, light: 7, rubWet: 3 });
    expect(() => makeDyestuff({ ...base, fastness: { wash: 6 } })).toThrow(/between 1 and 5/);
    expect(() => makeDyestuff({ ...base, fastness: { light: 9 } })).toThrow(/between 1 and 8/);
  });

  it('drops a rating that was left blank instead of guessing one', () => {
    const dye = makeDyestuff({ ...base, fastness: { wash: 4, light: null } });
    expect(dye.fastness).toEqual({ wash: 4 });
    expect(FASTNESS_TESTS).toContain('perspiration');
  });

  it('needs a price, because everything downstream costs a recipe', () => {
    expect(() => makeDyestuff({ ...base, pricePerKg: 0 })).toThrow(/pricePerKg/);
  });
});

describe('the catalogue', () => {
  const dyes = [
    makeDyestuff(base),
    makeDyestuff({ ...base, code: 'RB-19-NORD', supplier: 'Nordfarben', strength: 133 }),
    makeDyestuff({ ...base, code: 'DR-60-ACME', dyeClass: 'disperse', colourIndex: 'DR60' }),
  ];

  it('keys on the supplier article, not on the colour index', () => {
    const catalogue = createCatalogue(dyes);
    expect(catalogue.size).toBe(3);
    expect(find(catalogue, 'RB-19-NORD').strength).toBe(133);
  });

  it('refuses the same article code twice', () => {
    expect(() => createCatalogue([dyes[0], dyes[0]])).toThrow(/appears twice/);
  });

  it('says so when an article is not stocked', () => {
    expect(() => find(createCatalogue(dyes), 'RB-19-OTHER')).toThrow(/not in the catalogue/);
  });

  it('lists what will colour a given fibre', () => {
    const catalogue = createCatalogue(dyes);
    expect(dyesFor(catalogue, 'cotton').map((d) => d.code)).toEqual(['RB-19-ACME', 'RB-19-NORD']);
    expect(dyesFor(catalogue, 'polyester').map((d) => d.code)).toEqual(['DR-60-ACME']);
    expect(dyesFor(catalogue, 'elastane')).toEqual([]);
  });

  it('finds the substitution candidates and never the article itself', () => {
    const catalogue = createCatalogue(dyes);
    expect(sameColourIndex(catalogue, 'RB-19-ACME').map((d) => d.code)).toEqual(['RB-19-NORD']);
    expect(sameColourIndex(catalogue, 'DR-60-ACME')).toEqual([]);
  });

  it('returns nothing for an article carrying no colour index at all', () => {
    const catalogue = createCatalogue([makeDyestuff({ ...base, colourIndex: null })]);
    expect(sameColourIndex(catalogue, 'RB-19-ACME')).toEqual([]);
  });
});

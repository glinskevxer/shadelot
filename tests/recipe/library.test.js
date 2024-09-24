import { beforeEach, describe, expect, it } from 'vitest';
import { createCatalogue, makeDyestuff } from '../../src/dyestuff/catalogue.js';
import { createChemicalStore } from '../../src/chemical/catalogue.js';
import { makeRecipe } from '../../src/recipe/recipe.js';
import {
  bestPerforming,
  createLibrary,
  depthRatio,
  nearest,
  ratioDistance,
  record,
  scaleToDepth,
  unproven,
} from '../../src/recipe/library.js';

const catalogue = createCatalogue([
  makeDyestuff({ code: 'Y', name: 'Yellow', supplier: 'A', dyeClass: 'reactive', pricePerKg: 20 }),
  makeDyestuff({ code: 'R', name: 'Red', supplier: 'A', dyeClass: 'reactive', pricePerKg: 26 }),
  makeDyestuff({ code: 'B', name: 'Blue', supplier: 'A', dyeClass: 'reactive', pricePerKg: 24 }),
  makeDyestuff({ code: 'D', name: 'Navy', supplier: 'A', dyeClass: 'disperse', pricePerKg: 18 }),
]);
const chemicals = createChemicalStore([]);

const build = (id, dyes, dyeClass = 'reactive') =>
  makeRecipe(
    {
      id,
      name: id,
      process: 'exhaust',
      substrate: 'cotton',
      liquorRatio: 8,
      dyes: dyes.map(([code, owf]) => ({ code: dyeClass === 'disperse' ? 'D' : code, owf })),
    },
    { catalogue, chemicals }
  );

const olive = build('R1', [
  ['Y', 1],
  ['R', 0.4],
  ['B', 0.6],
]);
const paleOlive = build('R2', [
  ['Y', 0.5],
  ['R', 0.2],
  ['B', 0.3],
]);
const green = build('R3', [
  ['Y', 1.4],
  ['R', 0.1],
  ['B', 0.5],
]);
const red = build('R4', [['R', 2]]);

describe('the distance between two recipes', () => {
  it('is nothing for the same proportions at another depth', () => {
    expect(ratioDistance(olive, paleOlive)).toBeCloseTo(0, 9);
  });

  it('grows as the proportions part company', () => {
    expect(ratioDistance(olive, green)).toBeGreaterThan(0);
    expect(ratioDistance(olive, red)).toBeGreaterThan(ratioDistance(olive, green));
  });

  it('never exceeds two, even with no dye in common', () => {
    expect(ratioDistance(build('X', [['Y', 1]]), build('Z', [['B', 1]]))).toBeCloseTo(2, 9);
  });

  it('is symmetric', () => {
    expect(ratioDistance(olive, green)).toBeCloseTo(ratioDistance(green, olive), 12);
  });
});

describe('the depth ratio', () => {
  it('reads the same whichever way round it is asked', () => {
    expect(depthRatio(olive, paleOlive)).toBeCloseTo(2, 9);
    expect(depthRatio(paleOlive, olive)).toBeCloseTo(2, 9);
  });

  it('is one for two recipes at the same depth', () => {
    expect(depthRatio(olive, build('X', [['B', 2]]))).toBeCloseTo(1, 9);
  });
});

describe('finding neighbours', () => {
  let library;
  beforeEach(() => {
    library = createLibrary([olive, paleOlive, green, red, build('R5', [['D', 1.5]], 'disperse')]);
  });

  it('puts the same proportions at another depth first', () => {
    expect(nearest(library, olive)[0].id).toBe('R2');
  });

  it('never proposes the recipe itself', () => {
    expect(nearest(library, olive).map((row) => row.id)).not.toContain('R1');
  });

  it('leaves out another dye class by default', () => {
    expect(nearest(library, olive, { maxDistance: 2 }).map((row) => row.id)).not.toContain('R5');
  });

  it('includes it when the class filter is turned off', () => {
    const rows = nearest(library, olive, { maxDistance: 2, sameClass: false });
    expect(rows.map((row) => row.id)).toContain('R5');
  });

  it('drops anything past the distance limit', () => {
    expect(nearest(library, olive, { maxDistance: 0.1 }).map((row) => row.id)).toEqual(['R2']);
  });

  it('returns at most the limit asked for', () => {
    expect(nearest(library, olive, { maxDistance: 2, limit: 2 })).toHaveLength(2);
  });

  it('prefers the better performing of two equally close recipes', () => {
    record(library, 'R3', { accepted: true });
    record(library, 'R3', { accepted: true });
    const rows = nearest(library, olive, { maxDistance: 2 });
    expect(rows.find((row) => row.id === 'R3').rightFirstTime).toBe(1);
  });
});

describe('recording how a recipe ran', () => {
  let library;
  beforeEach(() => {
    library = createLibrary([olive, green]);
  });

  it('starts with no runs and no rate', () => {
    expect(unproven(library)).toEqual(['R1', 'R3']);
    expect(library[0].rightFirstTime).toBeNull();
  });

  it('averages over the runs it has seen', () => {
    record(library, 'R1', { accepted: true });
    record(library, 'R1', { accepted: false });
    expect(library[0].runs).toBe(2);
    expect(library[0].rightFirstTime).toBeCloseTo(0.5, 9);
  });

  it('says nothing for a recipe the library does not hold', () => {
    expect(record(library, 'R9', { accepted: true })).toBeNull();
  });

  it('ranks the proven ones and leaves the thin ones out', () => {
    for (let i = 0; i < 4; i += 1) record(library, 'R1', { accepted: true });
    record(library, 'R3', { accepted: true });
    const ranked = bestPerforming(library);
    expect(ranked.map((row) => row.id)).toEqual(['R1']);
    expect(bestPerforming(library, { minimumRuns: 1 })).toHaveLength(2);
  });
});

describe('scaling to a depth', () => {
  it('keeps every ratio', () => {
    const scaled = scaleToDepth(olive, 1);
    expect(scaled.totalOwf).toBe(1);
    expect(ratioDistance(olive, { ...scaled, totalOwf: 1 })).toBeCloseTo(0, 9);
  });

  it('moves every dye by the same factor', () => {
    const scaled = scaleToDepth(olive, 4);
    expect(scaled.dyes[0].owf).toBeCloseTo(2, 9);
    expect(scaled.dyes[1].owf).toBeCloseTo(0.8, 9);
  });

  it('refuses a depth of nothing', () => {
    expect(() => scaleToDepth(olive, 0)).toThrow(/totalOwf/);
  });
});

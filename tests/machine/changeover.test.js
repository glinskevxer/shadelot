import { describe, expect, it } from 'vitest';
import { createChemicalStore, makeChemical } from '../../src/chemical/catalogue.js';
import { makeMachine } from '../../src/machine/register.js';
import {
  RECIPES,
  canSkip,
  changeoverCost,
  cleaningKinds,
  dayCleaningCost,
  recipeFor,
  resolveChemicals,
  totalChemicalCost,
} from '../../src/machine/changeover.js';

const jet = makeMachine({
  id: 'JET-4',
  type: 'jet',
  minLoadKg: 60,
  maxLoadKg: 300,
  deadVolumeLitres: 900,
  litresPerKg: 3.5,
});

const store = createChemicalStore([
  makeChemical({
    code: 'SOAP-1',
    name: 'Soaping agent',
    role: 'soaping',
    basis: 'gpl',
    pricePerKg: 4.8,
  }),
  makeChemical({
    code: 'SOAP-2',
    name: 'Soaping agent LC',
    role: 'soaping',
    basis: 'gpl',
    pricePerKg: 3.2,
  }),
  makeChemical({
    code: 'HYDRO',
    name: 'Sodium hydrosulphite',
    role: 'reducing',
    basis: 'gpl',
    pricePerKg: 1.9,
  }),
  makeChemical({
    code: 'NAOH',
    name: 'Caustic soda',
    role: 'alkali',
    basis: 'gpl',
    pricePerKg: 0.65,
  }),
]);

describe('the cleaning recipes', () => {
  it('name one per cleaning kind the sequencer produces', () => {
    expect(cleaningKinds()).toEqual(['none', 'rinse', 'boil', 'strip']);
    expect(Object.keys(RECIPES)).toEqual(cleaningKinds());
  });

  it('get heavier in baths and in chemicals', () => {
    expect(RECIPES.strip.baths).toBeGreaterThan(RECIPES.boil.baths);
    expect(RECIPES.strip.chemicals.length).toBeGreaterThan(RECIPES.boil.chemicals.length);
    expect(RECIPES.rinse.chemicals).toEqual([]);
  });

  it('refuse a kind nothing produces', () => {
    expect(() => recipeFor('scour')).toThrow(/must be one of none, rinse/);
  });
});

describe('what one changeover costs', () => {
  it('is nothing at all for no cleaning', () => {
    const cost = changeoverCost('none', jet);
    expect(cost.litres).toBe(0);
    expect(cost.heatKj).toBe(0);
    expect(cost.minutes).toBe(0);
  });

  it('runs on the machine empty volume rather than a load', () => {
    expect(changeoverCost('rinse', jet).litres).toBe(900);
    expect(changeoverCost('strip', jet).litres).toBe(2700);
  });

  it('costs heat only for the baths that are heated', () => {
    expect(changeoverCost('rinse', jet).heatKj).toBeGreaterThan(0);
    expect(changeoverCost('boil', jet).heatKj).toBeGreaterThan(changeoverCost('rinse', jet).heatKj);
  });

  it('takes a warmer works and charges less heat', () => {
    expect(changeoverCost('boil', jet, { ambient: 40 }).heatKj).toBeLessThan(
      changeoverCost('boil', jet, { ambient: 10 }).heatKj
    );
  });

  it('carries the minutes the sequencer already uses', () => {
    expect(changeoverCost('boil', jet).minutes).toBe(60);
    expect(changeoverCost('strip', jet).minutes).toBe(120);
  });

  it('works a weight out for each chemical the recipe names', () => {
    const cost = changeoverCost('strip', jet);
    expect(cost.chemicals).toHaveLength(3);
    expect(cost.chemicals[0].kg).toBeCloseTo(3.6, 9);
  });
});

describe('resolving the chemicals against the store', () => {
  it('takes the cheapest article that plays the role', () => {
    const lines = resolveChemicals(changeoverCost('boil', jet), store);
    expect(lines[0].code).toBe('SOAP-2');
  });

  it('costs each line at that article', () => {
    const lines = resolveChemicals(changeoverCost('boil', jet), store);
    expect(lines[0].cost).toBeCloseTo(lines[0].kg * 3.2, 9);
  });

  it('says so when the works stocks nothing for a step', () => {
    const thin = createChemicalStore([store.get('SOAP-1')]);
    expect(() => resolveChemicals(changeoverCost('strip', jet), thin)).toThrow(
      /stocks nothing for the reducing step/
    );
  });

  it('totals the chemical cost of a changeover', () => {
    expect(totalChemicalCost(changeoverCost('strip', jet), store)).toBeGreaterThan(0);
    expect(totalChemicalCost(changeoverCost('rinse', jet), store)).toBe(0);
  });
});

describe('a day of changeovers', () => {
  const steps = [{ clean: 'rinse' }, { clean: 'none' }, { clean: 'boil' }, { clean: 'strip' }];

  it('totals the water, the time and the heat', () => {
    const day = dayCleaningCost(steps, jet);
    expect(day.changeovers).toBe(4);
    expect(day.litres).toBe(900 + 0 + 1800 + 2700);
    expect(day.minutes).toBe(20 + 0 + 60 + 120);
    expect(day.heatKj).toBeGreaterThan(0);
  });

  it('is nothing for a day with no changeovers', () => {
    expect(dayCleaningCost([], jet).litres).toBe(0);
  });

  it('keeps a row per changeover for the report', () => {
    expect(dayCleaningCost(steps, jet).rows.map((row) => row.clean)).toEqual([
      'rinse',
      'none',
      'boil',
      'strip',
    ]);
  });
});

describe('skipping a cleaning', () => {
  it('always skips nothing', () => {
    expect(canSkip('none').skip).toBe(true);
  });

  it('skips a rinse inside one family', () => {
    expect(canSkip('rinse', { sameFamily: true }).skip).toBe(true);
    expect(canSkip('rinse').skip).toBe(false);
  });

  it('skips a boil only for one customer and one family', () => {
    expect(canSkip('boil', { sameFamily: true }).skip).toBe(false);
    expect(canSkip('boil', { sameFamily: true, sameCustomer: true }).skip).toBe(true);
  });

  it('never skips a strip', () => {
    expect(canSkip('strip', { sameFamily: true, sameCustomer: true }).skip).toBe(false);
    expect(canSkip('strip').reason).toMatch(/cannot be skipped/);
  });

  it('refuses a kind nothing produces', () => {
    expect(() => canSkip('scour')).toThrow(/must be one of/);
  });
});

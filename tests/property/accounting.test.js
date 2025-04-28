/**
 * Properties of the accounting.
 *
 * Money and litres and kilograms have to add up, and they have to keep adding
 * up under every combination of inputs rather than the three somebody chose for
 * an example. These are the identities that must hold: a total is the sum of
 * its parts, a per unit figure times the units is the total, and nothing that
 * cannot be negative ever is.
 */

import { describe, expect, it } from 'vitest';
import { ceilToStep, dispensable, floorToStep, roundToStep } from '../../src/measure/rounding.js';
import { batchWater, makeRinse, waterShares } from '../../src/utility/water.js';
import { COST_HEADS, costBatch, costShares, makeTariff } from '../../src/cost/batch.js';
import { batchLoad, totalDay } from '../../src/effluent/load.js';
import { createChemicalStore, makeChemical } from '../../src/chemical/catalogue.js';
import { exhaustion, fixation, wasteFraction } from '../../src/process/exhaust.js';
import { splitVariance, reconciles } from '../../src/analysis/variance.js';

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const between = (random, low, high) => low + random() * (high - low);

const tariff = makeTariff({
  waterPerCubicMetre: 1.42,
  effluentPerCubicMetre: 0.88,
  electricityPerKwh: 0.191,
  steamPerTonne: 34.5,
  labourPerHour: 21.4,
  overheadPerMachineHour: 46,
});

const chemicals = createChemicalStore([
  makeChemical({ code: 'NACL', name: 'Salt', role: 'salt', basis: 'gpl', pricePerKg: 0.12 }),
  makeChemical({
    code: 'WET',
    name: 'Wetter',
    role: 'wetting',
    basis: 'owf',
    pricePerKg: 3.4,
    codLoad: 1.4,
  }),
]);

const cardFor = (random) => ({
  lines: [
    {
      kind: 'dye',
      code: 'RB-19',
      kg: between(random, 0.01, 8),
      unitPrice: between(random, 12, 40),
    },
    { kind: 'electrolyte', code: 'NACL', kg: between(random, 10, 200), unitPrice: 0.12 },
    { kind: 'auxiliary', code: 'WET', kg: between(random, 0.2, 6), unitPrice: 3.4 },
  ],
});

describe('rounding', () => {
  it('never moves a value by more than one step', () => {
    const random = generator(5);
    for (let i = 0; i < 500; i += 1) {
      const value = between(random, 0, 1000);
      const step = [0.0001, 0.001, 0.01, 0.1, 0.25, 1][Math.floor(random() * 6)];
      expect(Math.abs(roundToStep(value, step) - value)).toBeLessThanOrEqual(step / 2 + 1e-9);
    }
  });

  it('brackets the value between the floor and the ceiling', () => {
    const random = generator(6);
    for (let i = 0; i < 500; i += 1) {
      const value = between(random, 0, 1000);
      const step = 0.05;
      expect(floorToStep(value, step)).toBeLessThanOrEqual(value + 1e-9);
      expect(ceilToStep(value, step)).toBeGreaterThanOrEqual(value - 1e-9);
    }
  });

  it('always finds a balance that can hold a dispense', () => {
    const random = generator(7);
    for (let i = 0; i < 500; i += 1) {
      const value = between(random, 0.00005, 500);
      const result = dispensable(value);
      expect(result.amount).toBeGreaterThan(0);
      expect(result.balance).toBeTruthy();
    }
  });
});

describe('water', () => {
  it('always totals to the gross less the saving', () => {
    const random = generator(11);
    for (let i = 0; i < 300; i += 1) {
      const water = batchWater({
        bathLitres: between(random, 200, 6000),
        rinses: [makeRinse({ kind: 'drop-and-fill', baths: 1 + Math.floor(random() * 4) })],
        soapBaths: Math.floor(random() * 3),
        reusedBaths: 0,
      });
      expect(water.gross).toBeCloseTo(water.dye + water.rinsed + water.soap, 6);
      expect(water.net).toBeCloseTo(water.gross - water.saved, 6);
    }
  });

  it('splits the gross into shares that add to one', () => {
    const random = generator(12);
    for (let i = 0; i < 200; i += 1) {
      const water = batchWater({
        bathLitres: between(random, 200, 6000),
        rinses: [
          makeRinse({ kind: 'overflow', litresPerMinute: between(random, 20, 200), minutes: 10 }),
        ],
        soapBaths: 1,
      });
      const shares = waterShares(water);
      expect(shares.dye + shares.rinsed + shares.soap).toBeCloseTo(1, 9);
    }
  });
});

describe('costing', () => {
  it('always totals to the sum of its heads', () => {
    const random = generator(21);
    for (let i = 0; i < 200; i += 1) {
      const fibreKg = between(random, 20, 400);
      const costing = costBatch({
        tariff,
        passes: [
          {
            card: cardFor(random),
            water: { net: between(random, 1000, 12000) },
            energy: {
              motorKwh: between(random, 1, 60),
              steamKgEquivalent: between(random, 20, 400),
              minutes: between(random, 60, 480),
            },
          },
        ],
        fibreKg,
      });
      const summed = COST_HEADS.reduce((sum, head) => sum + costing.heads[head], 0);
      expect(costing.total).toBeCloseTo(summed, 6);
      expect(costing.perKgCharged).toBeCloseTo(costing.total / fibreKg, 9);
    }
  });

  it('splits into shares that add to one and are never negative', () => {
    const random = generator(22);
    for (let i = 0; i < 200; i += 1) {
      const costing = costBatch({
        tariff,
        passes: [
          {
            card: cardFor(random),
            water: { net: between(random, 1000, 12000) },
            energy: {
              motorKwh: between(random, 1, 60),
              steamKgEquivalent: between(random, 20, 400),
              minutes: between(random, 60, 480),
            },
          },
        ],
        fibreKg: between(random, 20, 400),
      });
      const shares = costShares(costing);
      expect(shares.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 6);
      expect(shares.every((row) => row.share > 0)).toBe(true);
    }
  });
});

describe('effluent', () => {
  it('never reports a negative load', () => {
    const random = generator(31);
    for (let i = 0; i < 200; i += 1) {
      const load = batchLoad({
        water: { net: between(random, 500, 12000) },
        card: cardFor(random),
        chemicals,
        fixation: between(random, 0.1, 0.99),
      });
      expect(load.codKg).toBeGreaterThanOrEqual(0);
      expect(load.tdsKg).toBeGreaterThanOrEqual(0);
      expect(load.unfixedKg).toBeGreaterThan(0);
    }
  });

  it('totals a day to the sum of its masses', () => {
    const random = generator(32);
    for (let i = 0; i < 100; i += 1) {
      const loads = Array.from({ length: 1 + Math.floor(random() * 5) }, () =>
        batchLoad({ water: { net: between(random, 500, 12000) }, card: cardFor(random), chemicals })
      );
      const day = totalDay(loads);
      expect(day.codKg).toBeCloseTo(
        loads.reduce((sum, load) => sum + load.codKg, 0),
        6
      );
      expect(day.volumeM3).toBeCloseTo(
        loads.reduce((sum, load) => sum + load.volumeM3, 0),
        6
      );
    }
  });
});

describe('exhaustion and fixation', () => {
  it('keeps fixation under exhaustion at every condition', () => {
    const random = generator(41);
    for (let i = 0; i < 400; i += 1) {
      const conditions = {
        saltGpl: between(random, 0.1, 200),
        temperature: between(random, 20, 120),
        liquorRatio: between(random, 3, 30),
        minutesAfterAlkali: between(random, 5, 200),
      };
      expect(fixation(conditions)).toBeLessThan(exhaustion(conditions) + 1e-12);
      expect(fixation(conditions) + wasteFraction(conditions)).toBeCloseTo(1, 12);
    }
  });

  it('keeps both inside nought and one', () => {
    const random = generator(42);
    for (let i = 0; i < 400; i += 1) {
      const conditions = {
        saltGpl: between(random, 0.1, 300),
        temperature: between(random, 20, 145),
        liquorRatio: between(random, 2, 40),
      };
      expect(exhaustion(conditions)).toBeGreaterThanOrEqual(0);
      expect(exhaustion(conditions)).toBeLessThanOrEqual(1);
      expect(fixation(conditions)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('variance', () => {
  it('always reconciles, whatever the plan and the actual', () => {
    const random = generator(51);
    const bands = ['pale', 'light', 'medium', 'dark'];
    for (let i = 0; i < 200; i += 1) {
      const plan = bands.map((band) => ({
        band,
        kg: between(random, 10, 4000),
        perKg: between(random, 0.8, 3),
      }));
      const actual = bands
        .filter(() => random() > 0.2)
        .map((band) => ({ band, kg: between(random, 10, 4000), perKg: between(random, 0.8, 3) }));
      if (actual.length === 0) continue;
      expect(reconciles(splitVariance(plan, actual), { tolerance: 1e-6 })).toBe(true);
    }
  });
});

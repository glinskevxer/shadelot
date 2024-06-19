import { describe, expect, it } from 'vitest';
import {
  COST_HEADS,
  cardCost,
  costBatch,
  costShares,
  labourCost,
  makeTariff,
  overheadCost,
  utilityCost,
} from '../../src/cost/batch.js';

const tariff = makeTariff({
  waterPerCubicMetre: 1.4,
  effluentPerCubicMetre: 0.9,
  electricityPerKwh: 0.19,
  steamPerTonne: 34,
  labourPerHour: 21,
  overheadPerMachineHour: 46,
});

const card = {
  lines: [
    { kind: 'dye', code: 'RB-19', kg: 3, unitPrice: 24 },
    { kind: 'electrolyte', code: 'NACL', kg: 80, unitPrice: 0.12 },
    { kind: 'auxiliary', code: 'WET-4', kg: 2, unitPrice: 3 },
  ],
};

const pass = {
  card,
  water: { net: 7200 },
  energy: { motorKwh: 20, steamKgEquivalent: 140, minutes: 120 },
};

describe('the tariff', () => {
  it('needs a price for everything that is billed', () => {
    expect(() => makeTariff({ ...tariff, waterPerCubicMetre: 0 })).toThrow(/waterPerCubicMetre/);
    expect(() => makeTariff({ ...tariff, labourPerHour: 0 })).toThrow(/labourPerHour/);
  });

  it('lets effluent and overhead be nothing, since not every works charges them', () => {
    const bare = makeTariff({
      ...tariff,
      effluentPerCubicMetre: undefined,
      overheadPerMachineHour: undefined,
    });
    expect(bare.effluentPerCubicMetre).toBe(0);
    expect(bare.overheadPerMachineHour).toBe(0);
  });
});

describe('the card', () => {
  it('splits dyestuff from everything else', () => {
    expect(cardCost(card)).toEqual({ dyestuff: 72, chemical: 80 * 0.12 + 6 });
  });

  it('reads the rounded weight rather than the exact one', () => {
    const rounded = {
      lines: [{ kind: 'dye', code: 'X', kg: 2.4, exactKg: 2.4173, unitPrice: 10 }],
    };
    expect(cardCost(rounded).dyestuff).toBeCloseTo(24, 9);
  });
});

describe('utilities', () => {
  it('charges water and effluent on the same volume', () => {
    const cost = utilityCost(tariff, pass);
    expect(cost.water).toBeCloseTo(7.2 * (1.4 + 0.9), 9);
  });

  it('charges electricity on the motors and steam on the heat', () => {
    const cost = utilityCost(tariff, pass);
    expect(cost.energy).toBeCloseTo(20 * 0.19 + 0.14 * 34, 9);
  });
});

describe('labour and overhead', () => {
  it('charge by the machine hour', () => {
    expect(labourCost(tariff, { minutes: 120 })).toBeCloseTo(42, 9);
    expect(overheadCost(tariff, { minutes: 120 })).toBeCloseTo(92, 9);
  });

  it('take a second operator on a double manned machine', () => {
    expect(labourCost(tariff, { minutes: 120, operators: 2 })).toBeCloseTo(84, 9);
  });

  it('refuse a negative run length or no operator at all', () => {
    expect(() => labourCost(tariff, { minutes: -1 })).toThrow(/minutes/);
    expect(() => labourCost(tariff, { minutes: 60, operators: 0 })).toThrow(/operators/);
  });
});

describe('the whole batch', () => {
  it('adds every head up', () => {
    const costing = costBatch({ tariff, passes: [pass], fibreKg: 200 });
    expect(Object.keys(costing.heads).sort()).toEqual([...COST_HEADS].sort());
    expect(costing.total).toBeCloseTo(
      72 + 9.6 + 6 + 7.2 * 2.3 + (20 * 0.19 + 0.14 * 34) + 42 + 92,
      6
    );
  });

  it('charges a second pass on top rather than averaging it in', () => {
    const one = costBatch({ tariff, passes: [pass], fibreKg: 200 });
    const two = costBatch({ tariff, passes: [pass, pass], fibreKg: 200 });
    expect(two.total).toBeCloseTo(one.total * 2, 6);
    expect(two.passes).toBe(2);
  });

  it('divides by what came out saleable, not by what went in', () => {
    const costing = costBatch({ tariff, passes: [pass], fibreKg: 200, saleableKg: 180 });
    expect(costing.perKgCharged).toBeCloseTo(costing.total / 200, 9);
    expect(costing.perKgSaleable).toBeCloseTo(costing.total / 180, 9);
    expect(costing.yield).toBeCloseTo(0.9, 9);
  });

  it('says nothing rather than dividing by zero when the whole batch was lost', () => {
    const costing = costBatch({ tariff, passes: [pass], fibreKg: 200, saleableKg: 0 });
    expect(costing.perKgSaleable).toBeNull();
    expect(costing.yield).toBe(0);
  });

  it('refuses more saleable cloth than went in', () => {
    expect(() => costBatch({ tariff, passes: [pass], fibreKg: 200, saleableKg: 220 })).toThrow(
      /cannot exceed what went in/
    );
  });

  it('needs at least one pass', () => {
    expect(() => costBatch({ tariff, passes: [], fibreKg: 200 })).toThrow(/at least one pass/);
  });
});

describe('the shares', () => {
  it('come back largest first and add to one', () => {
    const costing = costBatch({ tariff, passes: [pass], fibreKg: 200 });
    const shares = costShares(costing);
    expect(shares[0].share).toBeGreaterThanOrEqual(shares[1].share);
    expect(shares.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 9);
  });

  it('leaves out a head that cost nothing', () => {
    const free = makeTariff({ ...tariff, overheadPerMachineHour: 0 });
    const costing = costBatch({ tariff: free, passes: [pass], fibreKg: 200 });
    expect(costShares(costing).map((row) => row.head)).not.toContain('overhead');
  });
});

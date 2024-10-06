import { describe, expect, it } from 'vitest';
import { reworkCost, splitBy, summariseMonth, worstCost } from '../../src/analysis/monthly.js';

const batch = (id, extra = {}) => ({
  id,
  machineId: 'JET-4',
  customer: 'Kestrel',
  band: 'medium',
  fibreKg: 200,
  saleableKg: 200,
  cost: 420,
  waterLitres: 7200,
  machineMinutes: 240,
  passes: 1,
  accepted: true,
  ...extra,
});

describe('the month', () => {
  const batches = [
    batch('B1'),
    batch('B2', { passes: 2, cost: 840, accepted: true }),
    batch('B3', { accepted: false, saleableKg: 160 }),
  ];

  it('counts right first time as accepted on one pass', () => {
    const month = summariseMonth(batches);
    expect(month.firstTime).toBe(1);
    expect(month.rightFirstTime).toBeCloseTo(1 / 3, 9);
  });

  it('separates accepted from right first time', () => {
    const month = summariseMonth(batches);
    expect(month.accepted).toBe(2);
    expect(month.acceptedRate).toBeCloseTo(2 / 3, 9);
  });

  it('divides cost by what came out saleable', () => {
    const month = summariseMonth(batches);
    expect(month.saleableKg).toBe(560);
    expect(month.costPerSaleableKg).toBeCloseTo((420 + 840 + 420) / 560, 9);
  });

  it('reports water per saleable kilogram', () => {
    expect(summariseMonth(batches).litresPerKg).toBeCloseTo((7200 * 3) / 560, 9);
  });

  it('falls back to the load when no saleable weight is recorded', () => {
    const month = summariseMonth([batch('B1', { saleableKg: undefined })]);
    expect(month.saleableKg).toBe(200);
  });

  it('leaves utilisation null when nobody said how many hours there were', () => {
    expect(summariseMonth(batches).utilisation).toBeNull();
    expect(summariseMonth(batches, { machineHoursAvailable: 100 }).utilisation).toBeCloseTo(
      12 / 100,
      9
    );
  });

  it('refuses a month with no batches', () => {
    expect(() => summariseMonth([])).toThrow(/at least 1 entries/);
  });

  it('carries the month label through when given one', () => {
    expect(summariseMonth(batches, { month: '2025-04' }).month).toBe('2025-04');
  });
});

describe('splitting the month', () => {
  const batches = [
    batch('B1', { machineId: 'JET-4' }),
    batch('B2', { machineId: 'JET-5', accepted: false }),
    batch('B3', { machineId: 'JET-4' }),
  ];

  it('reads the same numbers per machine', () => {
    const rows = splitBy(batches, 'machineId');
    expect(rows.map((row) => row.machineId)).toEqual(['JET-4', 'JET-5']);
    expect(rows[0].batches).toBe(2);
    expect(rows[1].rightFirstTime).toBe(0);
  });

  it('reads them per customer just as well', () => {
    const mixed = [batch('B1', { customer: 'Kestrel' }), batch('B2', { customer: 'Marlow' })];
    expect(splitBy(mixed, 'customer').map((row) => row.customer)).toEqual(['Kestrel', 'Marlow']);
  });

  it('refuses a key that is not on every batch', () => {
    expect(() => splitBy(batches, 'shift')).toThrow(/is not on every batch, B1 has no shift/);
  });

  it('sorts the groups so a printed report does not shuffle', () => {
    const rows = splitBy(
      [batch('B1', { machineId: 'WIN-1' }), batch('B2', { machineId: 'JET-4' })],
      'machineId'
    );
    expect(rows.map((row) => row.machineId)).toEqual(['JET-4', 'WIN-1']);
  });
});

describe('the worst batches', () => {
  it('ranks by cost per saleable kilogram, dearest first', () => {
    const rows = worstCost([
      batch('B1'),
      batch('B2', { cost: 840, saleableKg: 200 }),
      batch('B3', { cost: 420, saleableKg: 100 }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['B2', 'B3', 'B1']);
  });

  it('leaves out a batch that yielded nothing rather than dividing by zero', () => {
    const rows = worstCost([batch('B1'), batch('B2', { saleableKg: 0 })]);
    expect(rows.map((row) => row.id)).toEqual(['B1']);
  });

  it('returns at most the limit asked for', () => {
    expect(worstCost([batch('B1'), batch('B2'), batch('B3')], { limit: 2 })).toHaveLength(2);
  });
});

describe('what the reworking cost', () => {
  it('is nothing when every batch ran once', () => {
    expect(reworkCost([batch('B1'), batch('B2')])).toEqual({ extraPasses: 0, cost: 0, share: 0 });
  });

  it('counts every pass past the first', () => {
    const rework = reworkCost([batch('B1'), batch('B2', { passes: 3, cost: 1260 })]);
    expect(rework.extraPasses).toBe(2);
    expect(rework.share).toBeCloseTo(0.5, 9);
  });

  it('prices the extra passes at the average pass cost', () => {
    const rework = reworkCost([
      batch('B1', { cost: 400, passes: 1 }),
      batch('B2', { cost: 800, passes: 2 }),
    ]);
    expect(rework.cost).toBeCloseTo(400, 9);
  });

  it('reports nothing rather than dividing by zero for an empty month', () => {
    expect(reworkCost([])).toEqual({ extraPasses: 0, cost: 0, share: 0 });
  });
});

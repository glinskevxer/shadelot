import { describe, expect, it } from 'vitest';
import {
  ENTHALPY_KJ_PER_KG,
  NORMAL_LOSS,
  allocateLosses,
  assessLosses,
  fuelForSteam,
  heatFromSteam,
  reconcileDay,
  steamFromHeat,
} from '../../src/utility/steam.js';

const batches = [
  { id: 'B1', steamKg: 140, fibreKg: 200 },
  { id: 'B2', steamKg: 96, fibreKg: 140 },
  { id: 'B3', steamKg: 180, fibreKg: 260 },
];

describe('steam and heat', () => {
  it('convert both ways', () => {
    expect(steamFromHeat(ENTHALPY_KJ_PER_KG)).toBeCloseTo(1, 9);
    expect(heatFromSteam(1)).toBe(ENTHALPY_KJ_PER_KG);
    expect(steamFromHeat(heatFromSteam(42))).toBeCloseTo(42, 9);
  });

  it('refuse nothing at all', () => {
    expect(() => steamFromHeat(0)).toThrow(/kilojoules/);
    expect(() => heatFromSteam(0)).toThrow(/kilograms/);
  });
});

describe('fuel', () => {
  it('rises as the boiler gets worse', () => {
    expect(fuelForSteam(1000, { efficiency: 0.7 })).toBeGreaterThan(
      fuelForSteam(1000, { efficiency: 0.9 })
    );
  });

  it('falls with a richer fuel', () => {
    expect(fuelForSteam(1000, { calorificValue: 50000 })).toBeLessThan(fuelForSteam(1000));
  });

  it('refuses an efficiency nothing measures', () => {
    expect(() => fuelForSteam(1000, { efficiency: 1.4 })).toThrow(/efficiency/);
    expect(() => fuelForSteam(1000, { efficiency: 0.1 })).toThrow(/efficiency/);
  });
});

describe('reconciling a day', () => {
  it('names the gap rather than absorbing it', () => {
    const day = reconcileDay({ boilerSteamKg: 500, batches });
    expect(day.batchSteamKg).toBe(416);
    expect(day.unaccountedKg).toBe(84);
    expect(day.unaccountedShare).toBeCloseTo(84 / 500, 9);
  });

  it('takes the other uses off before the gap', () => {
    const day = reconcileDay({
      boilerSteamKg: 500,
      batches,
      otherUses: [{ name: 'drying range', steamKg: 40 }],
    });
    expect(day.otherSteamKg).toBe(40);
    expect(day.unaccountedKg).toBe(44);
  });

  it('goes negative when the batches claim more than the boiler made', () => {
    expect(reconcileDay({ boilerSteamKg: 300, batches }).unaccountedKg).toBeLessThan(0);
  });

  it('takes a day with no batches at all', () => {
    const day = reconcileDay({ boilerSteamKg: 500, batches: [] });
    expect(day.batchSteamKg).toBe(0);
    expect(day.unaccountedShare).toBe(1);
  });

  it('refuses a batch with no steam against it', () => {
    expect(() => reconcileDay({ boilerSteamKg: 500, batches: [{ id: 'B1' }] })).toThrow(
      /batch.steamKg/
    );
  });
});

describe('assessing the losses', () => {
  it('calls an ordinary gap normal', () => {
    const day = reconcileDay({ boilerSteamKg: 470, batches });
    expect(assessLosses(day).state).toBe('normal');
    expect(NORMAL_LOSS).toBe(0.12);
  });

  it('calls a bigger one high and says to walk the traps', () => {
    const day = reconcileDay({ boilerSteamKg: 520, batches });
    const result = assessLosses(day);
    expect(result.state).toBe('high');
    expect(result.note).toMatch(/walking the traps/);
  });

  it('raises an alarm on a large gap', () => {
    const day = reconcileDay({ boilerSteamKg: 700, batches });
    expect(assessLosses(day).state).toBe('alarm');
  });

  it('calls a negative gap impossible rather than good', () => {
    const day = reconcileDay({ boilerSteamKg: 300, batches });
    expect(assessLosses(day).state).toBe('impossible');
    expect(assessLosses(day).note).toMatch(/more steam than the boiler made/);
  });

  it('refuses an alarm line under the normal one', () => {
    const day = reconcileDay({ boilerSteamKg: 500, batches });
    expect(() => assessLosses(day, { normal: 0.3, alarm: 0.2 })).toThrow(/above the normal loss/);
  });
});

describe('allocating the gap back', () => {
  const day = reconcileDay({ boilerSteamKg: 500, batches });

  it('adds up to the boiler figure', () => {
    const rows = allocateLosses(day, batches);
    const charged = rows.reduce((sum, row) => sum + row.chargedKg, 0);
    expect(charged).toBeCloseTo(500, 6);
  });

  it('gives the heaviest user the largest share by default', () => {
    const rows = allocateLosses(day, batches);
    expect(rows[2].allocatedKg).toBeGreaterThan(rows[1].allocatedKg);
  });

  it('allocates by cloth when asked, which is a different split', () => {
    const bySteam = allocateLosses(day, batches);
    const byCloth = allocateLosses(day, batches, { by: 'cloth' });
    expect(byCloth[0].allocatedKg).not.toBeCloseTo(bySteam[0].allocatedKg, 6);
  });

  it('allocates nothing when the batches over claimed', () => {
    const short = reconcileDay({ boilerSteamKg: 300, batches });
    const rows = allocateLosses(short, batches);
    expect(rows.every((row) => row.allocatedKg === 0)).toBe(true);
  });
});

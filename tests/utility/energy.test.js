import { describe, expect, it } from 'vitest';
import { makeProfile } from '../../src/process/curve.js';
import {
  KJ_PER_KWH,
  SPECIFIC_HEAT_WATER,
  batchEnergy,
  heatingEnergyKj,
  motorEnergyKwh,
  profileEnergy,
  standingLossKj,
} from '../../src/utility/energy.js';

const profile = makeProfile({
  id: 'P',
  name: 'reactive at sixty',
  segments: [
    { kind: 'ramp', label: 'to sixty', to: 60, ratePerMinute: 2 },
    { kind: 'hold', label: 'exhaust', at: 60, minutes: 30 },
    { kind: 'ramp', label: 'cool to forty', to: 40, ratePerMinute: 2 },
  ],
});

const machine = { lossKwPerDegree: 0.05, motorKw: 11 };

describe('heating water', () => {
  it('is mass times specific heat times the rise', () => {
    expect(heatingEnergyKj(1000, 20, 60)).toBeCloseTo(1000 * SPECIFIC_HEAT_WATER * 40, 6);
  });

  it('is nothing when the bath is already there or above', () => {
    expect(heatingEnergyKj(1000, 60, 60)).toBe(0);
    expect(heatingEnergyKj(1000, 60, 40)).toBe(0);
  });

  it('refuses a bath of no volume', () => {
    expect(() => heatingEnergyKj(0, 20, 60)).toThrow(/litres/);
  });
});

describe('standing losses', () => {
  it('come off the machine rate rather than being derived', () => {
    expect(standingLossKj(machine, 60, 60)).toBeCloseTo(0.05 * 40 * 1 * KJ_PER_KWH, 6);
  });

  it('are nothing for a machine with no measured rate', () => {
    expect(standingLossKj({}, 60, 60)).toBe(0);
  });

  it('are nothing at ambient', () => {
    expect(standingLossKj(machine, 20, 60)).toBe(0);
    expect(standingLossKj(machine, 10, 60)).toBe(0);
  });

  it('scale with the time held', () => {
    expect(standingLossKj(machine, 60, 120)).toBeCloseTo(2 * standingLossKj(machine, 60, 60), 6);
  });
});

describe('a whole profile', () => {
  it('charges for heating up and not for cooling down', () => {
    const energy = profileEnergy(profile, { litres: 1600, machine: {} });
    expect(energy.heatingKj).toBeCloseTo(heatingEnergyKj(1600, 20, 60), 6);
    expect(energy.standingKj).toBe(0);
  });

  it('adds the standing loss on every segment', () => {
    const withLoss = profileEnergy(profile, { litres: 1600, machine });
    const withoutLoss = profileEnergy(profile, { litres: 1600, machine: {} });
    expect(withLoss.standingKj).toBeGreaterThan(0);
    expect(withLoss.totalKj).toBeGreaterThan(withoutLoss.totalKj);
  });

  it('reports the same energy in both units', () => {
    const energy = profileEnergy(profile, { litres: 1600, machine });
    expect(energy.totalKwh).toBeCloseTo(energy.totalKj / KJ_PER_KWH, 9);
  });

  it('takes a warmer works as ambient and charges less standing loss', () => {
    const cold = profileEnergy(profile, { litres: 1600, machine, ambient: 10 });
    const warm = profileEnergy(profile, { litres: 1600, machine, ambient: 30 });
    expect(warm.standingKj).toBeLessThan(cold.standingKj);
  });

  it('refuses a bath of no volume', () => {
    expect(() => profileEnergy(profile, { litres: 0 })).toThrow(/litres/);
  });
});

describe('motors', () => {
  it('draw a flat load for the run', () => {
    expect(motorEnergyKwh(machine, 120)).toBeCloseTo(22, 9);
  });

  it('draw nothing when no rating is recorded', () => {
    expect(motorEnergyKwh({}, 120)).toBe(0);
  });
});

describe('everything a batch draws', () => {
  const energy = batchEnergy(profile, { litres: 1600, machine });

  it('carries the run length it worked the motors over', () => {
    expect(energy.minutes).toBeCloseTo(20 + 30 + 10, 9);
    expect(energy.motorKwh).toBeCloseTo((11 * 60) / 60, 9);
  });

  it('converts the heat into the steam the boiler house is billed in', () => {
    expect(energy.steamKgEquivalent).toBeCloseTo(energy.totalKj / 2200, 9);
  });

  it('handles a machine with no ratings at all', () => {
    const bare = batchEnergy(profile, { litres: 1600 });
    expect(bare.motorKwh).toBe(0);
    expect(bare.standingKj).toBe(0);
    expect(bare.heatingKj).toBeGreaterThan(0);
  });
});

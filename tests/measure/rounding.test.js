import { describe, expect, it } from 'vitest';
import {
  BALANCE_STEPS,
  balanceNames,
  balanceStep,
  ceilToStep,
  dispensable,
  floorToStep,
  roundHalfUp,
  roundToStep,
} from '../../src/measure/rounding.js';

describe('half up rounding', () => {
  it('sends a half away from zero every time, not to the even neighbour', () => {
    expect(roundHalfUp(0.125, 2)).toBe(0.13);
    expect(roundHalfUp(0.135, 2)).toBe(0.14);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(3.5)).toBe(4);
  });

  it('treats a negative the same distance from zero', () => {
    expect(roundHalfUp(-0.125, 2)).toBe(-0.13);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });

  it('leaves a number that is already short enough alone', () => {
    expect(roundHalfUp(1.2, 4)).toBe(1.2);
  });
});

describe('rounding to a step', () => {
  it('lands on multiples of the step', () => {
    expect(roundToStep(0.0347, 0.001)).toBe(0.035);
    expect(roundToStep(12.4, 0.25)).toBe(12.5);
    expect(roundToStep(12.3, 0.25)).toBe(12.25);
  });

  it('does not leave a binary tail behind', () => {
    expect(roundToStep(0.1 + 0.2, 0.01)).toBe(0.3);
    expect(String(roundToStep(2.675, 0.01))).toBe('2.68');
  });

  it('goes up when the caller cannot come up short', () => {
    expect(ceilToStep(12.01, 0.5)).toBe(12.5);
    expect(ceilToStep(12.5, 0.5)).toBe(12.5);
  });

  it('goes down when the caller cannot overdraw a stock', () => {
    expect(floorToStep(12.49, 0.5)).toBe(12);
    expect(floorToStep(12.5, 0.5)).toBe(12.5);
  });

  it('refuses a step of zero rather than dividing by it', () => {
    expect(() => roundToStep(1, 0)).toThrow(/step must be greater than zero/);
    expect(() => ceilToStep(1, -1)).toThrow(/step/);
  });
});

describe('the balances the dispensary has', () => {
  it('names them finest first', () => {
    expect(balanceNames()).toEqual(['analytical', 'dispensary', 'bulk', 'drum']);
    expect(balanceStep('analytical')).toBe(0.0001);
    expect(Object.isFrozen(BALANCE_STEPS)).toBe(true);
  });

  it('says what it knows when a balance is misspelled', () => {
    expect(() => balanceStep('microbalance')).toThrow(/expected one of analytical, dispensary/);
  });
});

describe('choosing a balance for a dispense', () => {
  it('uses the drum for a bulk salt charge', () => {
    const result = dispensable(48.3);
    expect(result.balance).toBe('drum');
    expect(result.amount).toBe(48.3);
  });

  it('drops to the analytical balance for a trace shading dye', () => {
    const result = dispensable(0.00042);
    expect(result.balance).toBe('analytical');
    expect(result.amount).toBe(0.0004);
  });

  it('keeps the rounding inside the tolerance it was given', () => {
    const result = dispensable(0.0187, { tolerance: 0.02 });
    expect(Math.abs(result.shortfall) / 0.0187).toBeLessThanOrEqual(0.02);
  });

  it('reports a shortfall with a sign so a caller can tell over from under', () => {
    expect(dispensable(0.0184, { tolerance: 0.05 }).shortfall).toBeLessThan(0);
    expect(dispensable(0.0186, { tolerance: 0.05 }).shortfall).toBeGreaterThan(0);
    expect(dispensable(0.0184, { tolerance: 0.05 }).balance).toBe('dispensary');
  });

  it('lets a zero dose through as a zero on the finest balance', () => {
    expect(dispensable(0)).toEqual({ amount: 0, balance: 'analytical', shortfall: 0 });
  });

  it('refuses a negative dispense', () => {
    expect(() => dispensable(-1)).toThrow(/must not be negative/);
  });
});

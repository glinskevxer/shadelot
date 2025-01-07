import { describe, expect, it } from 'vitest';
import {
  BATH_KINDS,
  EFFICIENCY,
  bathVolumes,
  efficiencyOf,
  planWashOff,
  residueAfter,
  stainingRisk,
  washOff,
  worthAnotherBath,
} from '../../src/process/wash.js';

describe('the baths', () => {
  it('name what each kind takes off', () => {
    expect(BATH_KINDS).toHaveLength(4);
    expect(efficiencyOf('soap')).toBeGreaterThan(efficiencyOf('warm-rinse'));
    expect(efficiencyOf('warm-rinse')).toBeGreaterThan(efficiencyOf('cold-rinse'));
  });

  it('refuse a kind nothing runs', () => {
    expect(() => efficiencyOf('boil')).toThrow(/must be one of cold-rinse/);
    expect(Object.keys(EFFICIENCY)).toEqual(BATH_KINDS);
  });
});

describe('walking a sequence', () => {
  it('removes less each time', () => {
    const steps = washOff(['warm-rinse', 'warm-rinse', 'warm-rinse']);
    expect(steps[1].removed).toBeLessThan(steps[0].removed);
    expect(steps[2].removed).toBeLessThan(steps[1].removed);
  });

  it('never reaches zero however many baths are run', () => {
    const steps = washOff(new Array(8).fill('soap'));
    expect(steps.at(-1).residue).toBeGreaterThan(0);
  });

  it('leaves less after a soap than after a rinse', () => {
    expect(residueAfter(['soap'])).toBeLessThan(residueAfter(['cold-rinse']));
  });

  it('takes the starting residue from the caller', () => {
    expect(residueAfter(['soap'], { startingResidue: 0.5 })).toBeCloseTo(0.5 * 0.28, 9);
  });

  it('refuses an empty sequence or a residue off the scale', () => {
    expect(() => washOff([])).toThrow(/at least 1 entries/);
    expect(() => washOff(['soap'], { startingResidue: 1.4 })).toThrow(/startingResidue/);
  });

  it('numbers the steps', () => {
    expect(washOff(['cold-rinse', 'soap']).map((step) => step.step)).toEqual([1, 2]);
  });
});

describe('planning a wash off', () => {
  it('reaches an easy target with rinses alone', () => {
    const plan = planWashOff(0.13);
    expect(plan.reached).toBe(true);
    expect(plan.baths).not.toContain('soap');
  });

  it('takes the gentlest bath that reaches the target in one step', () => {
    expect(planWashOff(0.13).baths).toEqual(['warm-rinse']);
    expect(planWashOff(0.17).baths).toEqual(['cold-rinse']);
  });

  it('reaches for a soap when rinses cannot get there', () => {
    const plan = planWashOff(0.004);
    expect(plan.reached).toBe(true);
    expect(plan.baths).toContain('soap');
  });

  it('gives up rather than running forever', () => {
    const plan = planWashOff(0.0001, { maxBaths: 2 });
    expect(plan.reached).toBe(false);
    expect(plan.baths).toHaveLength(2);
  });

  it('runs nothing when the cloth is already clean enough', () => {
    const plan = planWashOff(0.3);
    expect(plan.baths).toEqual([]);
    expect(plan.reached).toBe(true);
  });

  it('honours a works that only allows cold rinses', () => {
    const plan = planWashOff(0.05, { allow: ['cold-rinse'] });
    expect(new Set(plan.baths)).toEqual(new Set(['cold-rinse']));
  });

  it('refuses an allow list with nothing useful in it', () => {
    expect(() => planWashOff(0.05, { allow: ['neutralise'] })).toThrow(
      /no bath that removes anything/
    );
  });

  it('lands where the walk says it does', () => {
    const plan = planWashOff(0.01);
    expect(residueAfter(plan.baths)).toBeCloseTo(plan.residue, 9);
  });
});

describe('whether another bath is worth it', () => {
  it('is worth it while there is something to take off', () => {
    expect(worthAnotherBath(0.1, 'soap')).toBe(true);
  });

  it('is not once the residue is small', () => {
    expect(worthAnotherBath(0.002, 'cold-rinse')).toBe(false);
  });

  it('depends on the bath, not only the residue', () => {
    expect(worthAnotherBath(0.008, 'soap')).toBe(true);
    expect(worthAnotherBath(0.008, 'neutralise')).toBe(false);
  });

  it('takes a works that thinks a smaller gain is worth a bath', () => {
    expect(worthAnotherBath(0.002, 'cold-rinse', { worthwhile: 0.0001 })).toBe(true);
  });
});

describe('the staining risk', () => {
  it('reads clear well under the limit', () => {
    expect(stainingRisk(0.005)).toBe('clear');
  });

  it('reads worse the more is left', () => {
    expect(stainingRisk(0.015)).toBe('acceptable');
    expect(stainingRisk(0.03)).toBe('marginal');
    expect(stainingRisk(0.08)).toBe('will stain');
  });

  it('takes a tighter limit from a critical customer', () => {
    expect(stainingRisk(0.015, { limit: 0.005 })).toBe('will stain');
  });

  it('counts the baths a plan needs', () => {
    expect(bathVolumes(['soap', 'cold-rinse'])).toBe(2);
    expect(bathVolumes([])).toBe(0);
  });
});

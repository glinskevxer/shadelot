import { describe, expect, it } from 'vitest';
import {
  D2,
  RULES,
  capability,
  controlLimits,
  diagnose,
  movingRanges,
  signalsIn,
} from '../../src/analysis/control.js';

const steady = [0.42, 0.38, 0.45, 0.4, 0.41, 0.39, 0.44, 0.4, 0.43, 0.41, 0.39, 0.42];
const drifting = [0.4, 0.42, 0.45, 0.49, 0.54, 0.6, 0.67, 0.75];

describe('moving ranges', () => {
  it('are the gaps between neighbours', () => {
    expect(movingRanges([1, 3, 2])).toEqual([2, 1]);
  });

  it('need at least two points', () => {
    expect(() => movingRanges([1])).toThrow(/at least 2 entries/);
  });
});

describe('the limits', () => {
  it('centre on the mean', () => {
    const limits = controlLimits(steady);
    expect(limits.centre).toBeCloseTo(steady.reduce((a, b) => a + b, 0) / steady.length, 9);
  });

  it('sit either side of the centre by three sigma', () => {
    const limits = controlLimits(steady);
    expect(limits.upper - limits.centre).toBeCloseTo(limits.centre - limits.lower, 9);
    expect(limits.upper - limits.centre).toBeCloseTo(3 * limits.sigma, 9);
  });

  it('work sigma off the moving range rather than the deviation', () => {
    const limits = controlLimits(steady);
    expect(limits.sigma).toBeCloseTo(limits.meanRange / D2, 9);
  });

  it('narrow when the caller asks for two sigma', () => {
    expect(controlLimits(steady, { sigmas: 2 }).upper).toBeLessThan(controlLimits(steady).upper);
  });

  it('refuse a series of one point', () => {
    expect(() => controlLimits([0.4])).toThrow(/at least 2 entries/);
  });
});

describe('the rules', () => {
  it('are the four this works runs and no more', () => {
    expect(RULES).toHaveLength(4);
    expect(RULES.map((rule) => rule.name)).toContain('eight on one side of centre');
  });

  it('finds nothing in a steady series', () => {
    expect(signalsIn(steady).inControl).toBe(true);
  });

  it('catches a single point past three sigma', () => {
    const spike = [...steady.slice(0, 8), 0.95];
    const result = signalsIn(spike);
    expect(result.inControl).toBe(false);
    expect(result.signals.some((signal) => signal.rule === 'one beyond three sigma')).toBe(true);
  });

  it('catches a run of six going one way', () => {
    const result = signalsIn(drifting);
    expect(result.signals.some((signal) => signal.rule === 'six rising or falling')).toBe(true);
  });

  it('catches eight on one side of the centre', () => {
    const shifted = [0.4, 0.4, 0.4, 0.4, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const result = signalsIn(shifted);
    expect(result.signals.some((signal) => signal.rule === 'eight on one side of centre')).toBe(
      true
    );
  });

  it('reports one rule per point rather than every rule it broke', () => {
    const result = signalsIn(drifting);
    const positions = result.signals.map((signal) => signal.at);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe('capability', () => {
  it('is comfortable for a steady series inside a wide tolerance', () => {
    const study = capability(steady, 1);
    expect(study.capable).toBe(true);
    expect(study.cp).toBeGreaterThan(1);
  });

  it('is not for a spread wider than the tolerance', () => {
    const study = capability(steady, 0.02);
    expect(study.capable).toBe(false);
  });

  it('drops when the centre sits away from the target', () => {
    const onTarget = capability(steady, 0.5);
    const offTarget = capability(steady, 0.5, { target: 0 });
    expect(offTarget.cpk).toBeLessThan(onTarget.cpk);
    expect(offTarget.drift).toBeGreaterThan(0);
  });

  it('handles a series with no variation at all', () => {
    const study = capability([0.4, 0.4, 0.4, 0.4], 1);
    expect(study.cp).toBe(Infinity);
    expect(study.capable).toBe(true);
  });

  it('refuses a tolerance of nothing', () => {
    expect(() => capability(steady, 0)).toThrow(/tolerance/);
  });
});

describe('the diagnosis', () => {
  it('says steady and inside for a good series', () => {
    expect(diagnose(steady, 1)).toMatch(/steady and inside/);
  });

  it('says the spread is too wide when it is', () => {
    expect(diagnose(steady, 0.02)).toMatch(/spread is wider/);
  });

  it('says something is moving it for a drift inside a wide tolerance', () => {
    expect(diagnose(drifting, 5)).toMatch(/something is moving it/);
  });

  it('says both when both', () => {
    expect(diagnose(drifting, 0.01)).toMatch(/both wandering and too wide/);
  });
});

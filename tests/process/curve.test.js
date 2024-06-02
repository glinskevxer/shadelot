import { describe, expect, it } from 'vitest';
import {
  AMBIENT,
  SEGMENT_KINDS,
  fitsMachine,
  makeProfile,
  makeSegment,
  minutesAtOrAbove,
  peakTemperature,
  totalMinutes,
  walk,
} from '../../src/process/curve.js';

const profile = makeProfile({
  id: 'P-REACT-60',
  name: 'reactive exhaust at sixty',
  segments: [
    { kind: 'fill', label: 'fill the bath', minutes: 6, litres: 1600 },
    { kind: 'ramp', label: 'to sixty', to: 60, ratePerMinute: 2 },
    { kind: 'dose', label: 'salt in four portions', chemical: 'NACL', minutes: 20, portions: 4 },
    { kind: 'hold', label: 'exhaust', at: 60, minutes: 30 },
    { kind: 'dose', label: 'alkali', chemical: 'SODA', minutes: 15 },
    { kind: 'hold', label: 'fix', at: 60, minutes: 45 },
    { kind: 'drain', label: 'drop the bath', minutes: 8, litres: 1600 },
  ],
});

describe('segments', () => {
  it('takes a rate for a ramp and a duration for a hold', () => {
    expect(
      makeSegment({ kind: 'ramp', label: 'up', to: 98, ratePerMinute: 1.5 }).ratePerMinute
    ).toBe(1.5);
    expect(makeSegment({ kind: 'hold', label: 'boil', at: 98, minutes: 20 }).minutes).toBe(20);
  });

  it('defaults a dose to a single portion', () => {
    expect(makeSegment({ kind: 'dose', label: 'x', chemical: 'NACL', minutes: 10 }).portions).toBe(
      1
    );
  });

  it('refuses a temperature nothing in the hall reaches', () => {
    expect(() => makeSegment({ kind: 'ramp', label: 'up', to: 200, ratePerMinute: 1 })).toThrow(
      /segment.to/
    );
  });

  it('refuses a ramp with no rate and a hold with no time', () => {
    expect(() => makeSegment({ kind: 'ramp', label: 'up', to: 60 })).toThrow(/ratePerMinute/);
    expect(() => makeSegment({ kind: 'hold', label: 'x', at: 60 })).toThrow(/minutes/);
  });

  it('names every kind it knows', () => {
    expect(SEGMENT_KINDS).toEqual(['ramp', 'hold', 'dose', 'drain', 'fill']);
    expect(() => makeSegment({ kind: 'cool', label: 'x', minutes: 5 })).toThrow(/segment.kind/);
  });
});

describe('a profile', () => {
  it('starts at ambient unless told otherwise', () => {
    expect(profile.startAt).toBe(AMBIENT);
    expect(makeProfile({ ...profile, startAt: 40 }).startAt).toBe(40);
  });

  it('needs at least one segment', () => {
    expect(() => makeProfile({ id: 'P', name: 'empty', segments: [] })).toThrow(
      /at least one segment/
    );
  });
});

describe('walking it', () => {
  const steps = walk(profile);

  it('turns a ramp rate into minutes', () => {
    const ramp = steps.find((step) => step.kind === 'ramp');
    expect(ramp.from).toBe(20);
    expect(ramp.to).toBe(60);
    expect(ramp.minutes).toBeCloseTo(20, 9);
  });

  it('carries the temperature through a dose that does not change it', () => {
    const dose = steps.find((step) => step.label === 'salt in four portions');
    expect(dose.from).toBe(60);
    expect(dose.to).toBe(60);
  });

  it('accumulates the elapsed time', () => {
    expect(steps.at(-1).elapsed).toBeCloseTo(totalMinutes(profile), 9);
    expect(totalMinutes(profile)).toBeCloseTo(6 + 20 + 20 + 30 + 15 + 45 + 8, 9);
  });

  it('takes the same rate cooling as heating', () => {
    const cooling = makeProfile({
      id: 'P',
      name: 'cool',
      startAt: 98,
      segments: [{ kind: 'ramp', label: 'down', to: 60, ratePerMinute: 2 }],
    });
    expect(totalMinutes(cooling)).toBeCloseTo(19, 9);
  });
});

describe('what the profile reaches', () => {
  it('reports the peak', () => {
    expect(peakTemperature(profile)).toBe(60);
  });

  it('counts only holds towards time at temperature', () => {
    expect(minutesAtOrAbove(profile, 60)).toBeCloseTo(75, 9);
    expect(minutesAtOrAbove(profile, 61)).toBe(0);
    expect(minutesAtOrAbove(profile, 40)).toBeCloseTo(75, 9);
  });

  it('refuses a temperature off the scale', () => {
    expect(() => minutesAtOrAbove(profile, 200)).toThrow(/temperature/);
  });
});

describe('against a machine', () => {
  it('passes a profile the machine can reach', () => {
    expect(fitsMachine(profile, { maxTemperature: 98 })).toEqual({ fits: true, reason: 'ok' });
  });

  it('names the peak and the limit when it cannot', () => {
    const hot = makeProfile({
      id: 'P',
      name: 'polyester',
      segments: [{ kind: 'ramp', label: 'up', to: 130, ratePerMinute: 1.5 }],
    });
    const verdict = fitsMachine(hot, { maxTemperature: 98 });
    expect(verdict.fits).toBe(false);
    expect(verdict.reason).toMatch(/peaks at 130 against a machine limit of 98/);
  });
});

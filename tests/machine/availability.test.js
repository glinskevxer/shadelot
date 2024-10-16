import { beforeEach, describe, expect, it } from 'vitest';
import {
  SHIFT_PATTERNS,
  availabilityOn,
  canFit,
  commit,
  firstFreeDay,
  makeCalendar,
  releaseCommitment,
  shiftHours,
  utilisationOver,
} from '../../src/machine/availability.js';

const base = {
  machineId: 'JET-4',
  pattern: 'double',
  outages: [
    { from: '2025-05-05', to: '2025-05-05', hours: 6, reason: 'pump seal', planned: false },
    { from: '2025-05-12', to: '2025-05-13', hours: 4, reason: 'planned service' },
  ],
};

describe('shift patterns', () => {
  it('name the hours each gives', () => {
    expect(shiftHours('single')).toBe(8);
    expect(shiftHours('continuous')).toBe(24);
    expect(Object.keys(SHIFT_PATTERNS)).toHaveLength(4);
  });

  it('refuse a pattern nothing works', () => {
    expect(() => shiftHours('triple')).toThrow(/must be one of single, double/);
  });
});

describe('a calendar', () => {
  it('defaults to a double shift', () => {
    expect(makeCalendar({ machineId: 'JET-4' }).pattern).toBe('double');
  });

  it('treats an outage as planned unless told otherwise', () => {
    const calendar = makeCalendar(base);
    expect(calendar.outages[0].planned).toBe(false);
    expect(calendar.outages[1].planned).toBe(true);
  });

  it('refuses an outage with no reason against it', () => {
    expect(() =>
      makeCalendar({ machineId: 'X', outages: [{ from: 'a', to: 'b', hours: 2 }] })
    ).toThrow(/outage.reason/);
  });

  it('takes a machine with no outages at all', () => {
    expect(makeCalendar({ machineId: 'X' }).outages).toEqual([]);
  });
});

describe('what is available on a day', () => {
  let calendar;
  beforeEach(() => {
    calendar = makeCalendar(base);
  });

  it('is the whole shift on a clear day', () => {
    const row = availabilityOn(calendar, '2025-05-06');
    expect(row.nominal).toBe(16);
    expect(row.outage).toBe(0);
    expect(row.free).toBe(16);
  });

  it('takes the outage off', () => {
    expect(availabilityOn(calendar, '2025-05-05').free).toBe(10);
  });

  it('takes an outage spanning two days off both of them', () => {
    expect(availabilityOn(calendar, '2025-05-12').outage).toBe(4);
    expect(availabilityOn(calendar, '2025-05-13').outage).toBe(4);
    expect(availabilityOn(calendar, '2025-05-14').outage).toBe(0);
  });

  it('never takes off more than the shift gives', () => {
    const long = makeCalendar({
      machineId: 'X',
      pattern: 'single',
      outages: [{ from: 'd', to: 'd', hours: 40, reason: 'rebuild' }],
    });
    expect(availabilityOn(long, 'd').outage).toBe(8);
    expect(availabilityOn(long, 'd').free).toBe(0);
  });

  it('keeps the three numbers apart rather than folding them together', () => {
    commit(calendar, { batchId: 'B1', day: '2025-05-05', hours: 5 });
    const row = availabilityOn(calendar, '2025-05-05');
    expect(row.nominal).toBe(16);
    expect(row.outage).toBe(6);
    expect(row.committed).toBe(5);
    expect(row.free).toBe(5);
  });

  it('reports an overcommitment rather than a negative free figure', () => {
    commit(calendar, { batchId: 'B1', day: '2025-05-05', hours: 12 });
    const row = availabilityOn(calendar, '2025-05-05');
    expect(row.free).toBe(0);
    expect(row.overcommitted).toBe(2);
  });
});

describe('committing batches', () => {
  let calendar;
  beforeEach(() => {
    calendar = makeCalendar(base);
  });

  it('refuses the same batch twice', () => {
    commit(calendar, { batchId: 'B1', day: '2025-05-06', hours: 4 });
    expect(() => commit(calendar, { batchId: 'B1', day: '2025-05-07', hours: 4 })).toThrow(
      /already committed/
    );
  });

  it('releases and says whether there was anything to release', () => {
    commit(calendar, { batchId: 'B1', day: '2025-05-06', hours: 4 });
    expect(releaseCommitment(calendar, 'B1')).toBe(true);
    expect(releaseCommitment(calendar, 'B1')).toBe(false);
    expect(availabilityOn(calendar, '2025-05-06').committed).toBe(0);
  });

  it('answers whether one more batch fits', () => {
    commit(calendar, { batchId: 'B1', day: '2025-05-06', hours: 12 });
    expect(canFit(calendar, '2025-05-06', 4)).toBe(true);
    expect(canFit(calendar, '2025-05-06', 5)).toBe(false);
  });

  it('finds the first day a batch will fit', () => {
    commit(calendar, { batchId: 'B1', day: '2025-05-05', hours: 8 });
    const days = ['2025-05-05', '2025-05-06', '2025-05-07'];
    expect(firstFreeDay(calendar, days, 6)).toBe('2025-05-06');
  });

  it('says nothing when no day will take it', () => {
    expect(firstFreeDay(calendar, ['2025-05-05'], 20)).toBeNull();
  });
});

describe('utilisation over a run of days', () => {
  it('is committed hours against runnable hours', () => {
    const calendar = makeCalendar(base);
    commit(calendar, { batchId: 'B1', day: '2025-05-06', hours: 8 });
    commit(calendar, { batchId: 'B2', day: '2025-05-07', hours: 8 });
    const over = utilisationOver(calendar, ['2025-05-06', '2025-05-07']);
    expect(over.runnable).toBe(32);
    expect(over.utilisation).toBeCloseTo(0.5, 9);
  });

  it('does not count a day the machine was down towards the denominator', () => {
    const calendar = makeCalendar(base);
    const withOutage = utilisationOver(calendar, ['2025-05-05']);
    expect(withOutage.runnable).toBe(10);
    expect(withOutage.outage).toBe(6);
  });

  it('says nothing rather than dividing by zero when the machine was down all week', () => {
    const down = makeCalendar({
      machineId: 'X',
      pattern: 'single',
      outages: [{ from: 'a', to: 'z', hours: 8, reason: 'rebuild' }],
    });
    expect(utilisationOver(down, ['b', 'c']).utilisation).toBeNull();
  });

  it('refuses an empty run of days', () => {
    expect(() => utilisationOver(makeCalendar(base), [])).toThrow(/at least 1 entries/);
  });
});

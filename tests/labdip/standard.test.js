import { beforeEach, describe, expect, it } from 'vitest';
import { makeLab } from '../../src/colour/lab.js';
import {
  SOURCES,
  addMonths,
  currentReading,
  drift,
  dueForRemeasure,
  firstReading,
  isTrustworthy,
  makeStandard,
  remeasure,
} from '../../src/labdip/standard.js';

const base = {
  id: 'S25-0044',
  name: 'olive 4488',
  customer: 'Kestrel Apparel',
  readings: [{ at: '2024-03-04', reading: makeLab(52.14, -14.32, 22.68) }],
};

describe('a standard', () => {
  it('defaults to a customer standard measured twice a year', () => {
    const standard = makeStandard(base);
    expect(standard.source).toBe('customer');
    expect(standard.remeasureMonths).toBe(6);
    expect(SOURCES).toContain('previous-bulk');
  });

  it('sorts its readings whatever order they arrive in', () => {
    const standard = makeStandard({
      ...base,
      readings: [
        { at: '2025-01-04', reading: makeLab(52, -14, 22) },
        { at: '2024-03-04', reading: makeLab(52.14, -14.32, 22.68) },
      ],
    });
    expect(firstReading(standard).at).toBe('2024-03-04');
    expect(currentReading(standard).at).toBe('2025-01-04');
  });

  it('records who took each reading', () => {
    const standard = makeStandard({
      ...base,
      readings: [{ at: '2024-03-04', reading: makeLab(52, -14, 22), by: 'j.hollis' }],
    });
    expect(standard.readings[0].by).toBe('j.hollis');
    expect(makeStandard(base).readings[0].by).toBe('lab');
  });

  it('needs at least one reading and refuses one that is not one', () => {
    expect(() => makeStandard({ ...base, readings: [] })).toThrow(/at least 1 entries/);
    expect(() => makeStandard({ ...base, readings: [{ at: '2024-03-04', reading: {} }] })).toThrow(
      /must be a lab reading/
    );
  });

  it('refuses a source nothing comes from', () => {
    expect(() => makeStandard({ ...base, source: 'guess' })).toThrow(/standard.source/);
  });
});

describe('re-measuring', () => {
  let standard;
  beforeEach(() => {
    standard = makeStandard(base);
  });

  it('adds a reading rather than replacing one', () => {
    remeasure(standard, { at: '2024-09-04', reading: makeLab(52.4, -14.1, 22.5) });
    expect(standard.readings).toHaveLength(2);
    expect(firstReading(standard).at).toBe('2024-03-04');
  });

  it('keeps the readings in order whenever one arrives', () => {
    remeasure(standard, { at: '2025-03-04', reading: makeLab(52.6, -13.9, 22.3) });
    remeasure(standard, { at: '2024-09-04', reading: makeLab(52.4, -14.1, 22.5) });
    expect(standard.readings.map((entry) => entry.at)).toEqual([
      '2024-03-04',
      '2024-09-04',
      '2025-03-04',
    ]);
  });

  it('refuses two readings on one day', () => {
    expect(() => remeasure(standard, { at: '2024-03-04', reading: makeLab(52, -14, 22) })).toThrow(
      /already carries a reading/
    );
  });

  it('refuses anything on a retired standard', () => {
    const retired = makeStandard({ ...base, retired: true });
    expect(() => remeasure(retired, { at: '2025-01-01', reading: makeLab(52, -14, 22) })).toThrow(
      /is retired/
    );
  });
});

describe('the drift', () => {
  it('is not measured on a standard read once', () => {
    const moved = drift(makeStandard(base));
    expect(moved.measured).toBe(false);
    expect(moved.value).toBe(0);
  });

  it('is the distance from the first reading to the last', () => {
    const standard = makeStandard(base);
    remeasure(standard, { at: '2024-09-04', reading: makeLab(52.4, -14.1, 22.5) });
    remeasure(standard, { at: '2025-03-04', reading: makeLab(53.2, -13.6, 22.1) });
    const moved = drift(standard);
    expect(moved.measured).toBe(true);
    expect(moved.from).toBe('2024-03-04');
    expect(moved.to).toBe('2025-03-04');
    expect(moved.value).toBeGreaterThan(0);
  });

  it('reads in whichever formula the customer quotes', () => {
    const standard = makeStandard(base);
    remeasure(standard, { at: '2025-03-04', reading: makeLab(53.2, -13.6, 22.1) });
    expect(drift(standard, { formula: 'cie76' }).value).not.toBeCloseTo(drift(standard).value, 4);
  });

  it('refuses a formula nothing implements', () => {
    expect(() => drift(makeStandard(base), { formula: 'cie2020' })).toThrow(/formula/);
  });
});

describe('whether to trust it', () => {
  it('trusts a standard read once, with the reason', () => {
    const result = isTrustworthy(makeStandard(base));
    expect(result.trustworthy).toBe(true);
    expect(result.reason).toMatch(/nothing to compare it to/);
  });

  it('trusts one that has held', () => {
    const standard = makeStandard(base);
    remeasure(standard, { at: '2025-03-04', reading: makeLab(52.17, -14.3, 22.7) });
    expect(isTrustworthy(standard).trustworthy).toBe(true);
  });

  it('stops trusting one that has faded', () => {
    const standard = makeStandard(base);
    remeasure(standard, { at: '2025-03-04', reading: makeLab(54.8, -12.6, 20.9) });
    const result = isTrustworthy(standard);
    expect(result.trustworthy).toBe(false);
    expect(result.reason).toMatch(/ask for a fresh one/);
  });

  it('never trusts a retired one', () => {
    expect(isTrustworthy(makeStandard({ ...base, retired: true })).trustworthy).toBe(false);
  });

  it('takes a tighter limit for a critical shade', () => {
    const standard = makeStandard(base);
    remeasure(standard, { at: '2025-03-04', reading: makeLab(52.3, -14.3, 22.7) });
    expect(isTrustworthy(standard, { limit: 0.01 }).trustworthy).toBe(false);
  });
});

describe('the re-measure list', () => {
  const standards = [
    makeStandard(base),
    makeStandard({
      ...base,
      id: 'S25-0045',
      readings: [{ at: '2025-04-01', reading: makeLab(50, 0, 0) }],
    }),
    makeStandard({ ...base, id: 'S25-0046', retired: true }),
  ];

  it('adds the months to the last reading', () => {
    expect(addMonths('2024-03-04', 6)).toBe('2024-09-04');
    expect(addMonths('2024-11-30', 3)).toMatch(/^2025-0[23]-/);
  });

  it('lists the ones that are due, soonest first', () => {
    const due = dueForRemeasure(standards, '2025-05-01');
    expect(due.map((row) => row.id)).toEqual(['S25-0044']);
  });

  it('leaves a retired standard off the list', () => {
    expect(dueForRemeasure(standards, '2030-01-01').map((row) => row.id)).not.toContain('S25-0046');
  });

  it('takes a works that re-measures more often', () => {
    const due = dueForRemeasure(standards, '2025-05-01', { monthsFor: () => 1 });
    expect(due.map((row) => row.id)).toContain('S25-0045');
  });

  it('refuses a date it cannot read', () => {
    expect(() => addMonths('sometime', 6)).toThrow(/ISO calendar date/);
  });
});

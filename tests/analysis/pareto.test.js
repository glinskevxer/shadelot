import { describe, expect, it } from 'vitest';
import { bar, compareCuts, pareto, tallyBy, vitalFew } from '../../src/analysis/pareto.js';

const failures = [
  { id: 'B1', cause: 'unlevel', machineId: 'JET-4', fibreKg: 60 },
  { id: 'B2', cause: 'unlevel', machineId: 'JET-4', fibreKg: 60 },
  { id: 'B3', cause: 'unlevel', machineId: 'JET-4', fibreKg: 60 },
  { id: 'B4', cause: 'unlevel', machineId: 'JET-4', fibreKg: 60 },
  { id: 'B5', cause: 'weak', machineId: 'WIN-1', fibreKg: 300 },
  { id: 'B6', cause: 'weak', machineId: 'WIN-1', fibreKg: 300 },
  { id: 'B7', cause: 'crease', machineId: 'JIG-2', fibreKg: 40 },
  { id: 'B8', cause: 'stain', machineId: 'JIG-2', fibreKg: 40 },
];

describe('the tally', () => {
  it('counts one per row by default', () => {
    const totals = tallyBy(failures, 'cause');
    expect(totals.get('unlevel')).toBe(4);
    expect(totals.get('crease')).toBe(1);
  });

  it('weighs by whatever the caller says', () => {
    const totals = tallyBy(failures, 'cause', { weight: (row) => row.fibreKg });
    expect(totals.get('weak')).toBe(600);
  });

  it('refuses a key that is not on every row, and names the row', () => {
    expect(() => tallyBy([...failures, { id: 'B9' }], 'cause')).toThrow(/B9 has no cause/);
  });

  it('refuses an empty set', () => {
    expect(() => tallyBy([], 'cause')).toThrow(/at least 1 entries/);
  });
});

describe('the table', () => {
  const table = pareto(failures, 'cause');

  it('is ordered largest first', () => {
    expect(table[0].value).toBe('unlevel');
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i - 1].count).toBeGreaterThanOrEqual(table[i].count);
    }
  });

  it('carries a running share that ends at one', () => {
    expect(table.at(-1).cumulative).toBeCloseTo(1, 9);
  });

  it('marks the rows up to the threshold as the vital few', () => {
    expect(table.filter((row) => row.vital).map((row) => row.value)).toEqual([
      'unlevel',
      'weak',
      'crease',
    ]);
  });

  it('keeps the tail rather than dropping it', () => {
    expect(table).toHaveLength(4);
    expect(table.some((row) => !row.vital)).toBe(true);
  });

  it('takes a tighter threshold', () => {
    expect(vitalFew(failures, 'cause', { threshold: 0.5 })).toEqual(['unlevel']);
  });

  it('breaks a tie on the name so a printed table does not shuffle', () => {
    const tied = [
      { id: 'B1', cause: 'zebra' },
      { id: 'B2', cause: 'alpha' },
    ];
    expect(pareto(tied, 'cause').map((row) => row.value)).toEqual(['alpha', 'zebra']);
  });

  it('refuses a threshold nothing would mean', () => {
    expect(() => pareto(failures, 'cause', { threshold: 1.4 })).toThrow(/threshold/);
  });
});

describe('the two cuts', () => {
  it('agree when the failures are all the same size', () => {
    const even = failures.map((row) => ({ ...row, fibreKg: 100 }));
    expect(compareCuts(even, 'cause').agree).toBe(true);
  });

  it('disagree when the big batches fail for a different reason', () => {
    const result = compareCuts(failures, 'cause');
    expect(result.agree).toBe(false);
    expect(result.byCount[0]).toBe('unlevel');
    expect(result.byWeight[0]).toBe('weak');
  });

  it('says which one to act on', () => {
    expect(compareCuts(failures, 'cause').note).toMatch(/act on the weight one/);
  });

  it('reads a different key just as well', () => {
    const result = compareCuts(failures, 'machineId');
    expect(result.byCount).toContain('JET-4');
    expect(result.byWeight).toContain('WIN-1');
  });
});

describe('the bar', () => {
  it('fills in proportion', () => {
    expect(bar(0)).toBe('.'.repeat(24));
    expect(bar(1)).toBe('#'.repeat(24));
    expect(bar(0.5)).toBe(`${'#'.repeat(12)}${'.'.repeat(12)}`);
  });

  it('is always the width asked for', () => {
    expect(bar(0.37, { width: 10 })).toHaveLength(10);
  });

  it('refuses a share off the scale or a width of nothing', () => {
    expect(() => bar(1.4)).toThrow(/share/);
    expect(() => bar(0.5, { width: 0 })).toThrow(/width/);
  });
});

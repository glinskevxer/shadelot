import { describe, expect, it } from 'vitest';
import {
  OUTCOMES,
  byBatch,
  byWeight,
  classify,
  failureModes,
  rollingRate,
  tally,
  weightBias,
} from '../../src/quality/rft.js';

const batch = (id, extra = {}) => ({ id, fibreKg: 200, passes: 1, accepted: true, ...extra });

describe('classifying a batch', () => {
  it('calls a single pass acceptance right first time', () => {
    expect(classify(batch('B1'))).toBe('first-time');
  });

  it('calls a second pass corrected however it ended', () => {
    expect(classify(batch('B1', { passes: 2 }))).toBe('corrected');
    expect(classify(batch('B1', { passes: 2, accepted: true }))).toBe('corrected');
  });

  it('calls a downgrade a downgrade even on one pass', () => {
    expect(classify(batch('B1', { downgraded: true }))).toBe('downgraded');
  });

  it('puts a scrap ahead of everything else', () => {
    expect(classify(batch('B1', { scrapped: true, downgraded: true, passes: 3 }))).toBe('scrapped');
  });

  it('refuses a batch that was neither corrected nor accepted', () => {
    expect(() => classify(batch('B1', { accepted: false }))).toThrow(/batch.accepted/);
  });

  it('names the four outcomes', () => {
    expect(OUTCOMES).toEqual(['first-time', 'corrected', 'downgraded', 'scrapped']);
  });
});

describe('the tally', () => {
  const batches = [
    batch('B1'),
    batch('B2', { passes: 2 }),
    batch('B3', { downgraded: true, fibreKg: 100 }),
    batch('B4'),
  ];

  it('counts and weighs each outcome', () => {
    const result = tally(batches);
    expect(result.counts['first-time']).toBe(2);
    expect(result.kg['first-time']).toBe(400);
    expect(result.kg.downgraded).toBe(100);
  });

  it('refuses an empty month', () => {
    expect(() => tally([])).toThrow(/at least 1 entries/);
  });

  it('refuses a batch with no weight on it', () => {
    expect(() => tally([batch('B1', { fibreKg: 0 })])).toThrow(/batch.fibreKg/);
  });
});

describe('the two rates', () => {
  it('agree when every batch is the same size', () => {
    const batches = [batch('B1'), batch('B2', { passes: 2 })];
    expect(byBatch(batches)).toBeCloseTo(byWeight(batches), 9);
    expect(weightBias(batches)).toBeCloseTo(0, 9);
  });

  it('part company when the failures are the big batches', () => {
    const batches = [
      batch('B1', { fibreKg: 50 }),
      batch('B2', { fibreKg: 50 }),
      batch('B3', { fibreKg: 50 }),
      batch('B4', { fibreKg: 400, passes: 2 }),
    ];
    expect(byBatch(batches)).toBeCloseTo(0.75, 9);
    expect(byWeight(batches)).toBeLessThan(0.4);
    expect(weightBias(batches)).toBeLessThan(0);
  });

  it('read the other way when the failures are the small ones', () => {
    const batches = [batch('B1', { fibreKg: 400 }), batch('B2', { fibreKg: 20, passes: 2 })];
    expect(weightBias(batches)).toBeGreaterThan(0);
  });
});

describe('the run chart', () => {
  const batches = Array.from({ length: 30 }, (_, i) =>
    batch(`B${i}`, i % 5 === 0 ? { passes: 2 } : {})
  );

  it('gives one point per full window', () => {
    expect(rollingRate(batches, { window: 20 })).toHaveLength(11);
  });

  it('gives nothing when there are fewer batches than the window', () => {
    expect(rollingRate(batches.slice(0, 5), { window: 20 })).toEqual([]);
  });

  it('reads the weight rate when asked for it', () => {
    const heavy = batches.map((b, i) => ({ ...b, fibreKg: i % 5 === 0 ? 400 : 100 }));
    const byCount = rollingRate(heavy, { window: 20 });
    const byMass = rollingRate(heavy, { window: 20, measure: 'weight' });
    expect(byMass[0].rate).toBeLessThan(byCount[0].rate);
  });

  it('refuses a measure nothing computes', () => {
    expect(() => rollingRate(batches, { measure: 'metres' })).toThrow(/measure/);
  });
});

describe('where the failures went', () => {
  it('ranks them and leaves out the ones that never happened', () => {
    const batches = [
      batch('B1'),
      batch('B2', { passes: 2 }),
      batch('B3', { passes: 3 }),
      batch('B4', { scrapped: true }),
    ];
    const modes = failureModes(batches);
    expect(modes.map((row) => row.outcome)).toEqual(['corrected', 'scrapped']);
    expect(modes[0].share).toBeCloseTo(0.5, 9);
  });

  it('reports nothing for a perfect month', () => {
    expect(failureModes([batch('B1'), batch('B2')])).toEqual([]);
  });
});

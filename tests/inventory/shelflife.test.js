import { describe, expect, it } from 'vitest';
import {
  DECAY_PER_MONTH,
  STABILITY,
  STATES,
  assess,
  createShelfBook,
  makeShelfEntry,
  monthsBetween,
  review,
  strengthNow,
} from '../../src/inventory/shelflife.js';

const reactive = makeShelfEntry({
  code: 'RB-19-ACME',
  stability: 'slow-decay',
  monthsToUseBy: 24,
  retestMonths: 12,
  minimumStrength: 97,
});
const softener = makeShelfEntry({ code: 'SOFT-1', stability: 'splits', monthsToUseBy: 9 });
const salt = makeShelfEntry({ code: 'NACL-IND', stability: 'stable', monthsToUseBy: 60 });
const leveller = makeShelfEntry({
  code: 'LEV-7',
  stability: 'stable',
  monthsToUseBy: 36,
  retestMonths: 12,
});
const book = createShelfBook([reactive, softener, salt, leveller]);

describe('an entry', () => {
  it('defaults the strength floor to ninety five', () => {
    expect(salt.minimumStrength).toBe(95);
    expect(reactive.minimumStrength).toBe(97);
  });

  it('leaves the retest date unset unless one is given', () => {
    expect(salt.retestMonths).toBeNull();
  });

  it('refuses a stability class nothing measures', () => {
    expect(() => makeShelfEntry({ code: 'X', stability: 'fragile', monthsToUseBy: 6 })).toThrow(
      /shelf.stability/
    );
    expect(STABILITY).toEqual(['stable', 'slow-decay', 'splits']);
  });

  it('refuses a duplicate code in the book', () => {
    expect(() => createShelfBook([salt, salt])).toThrow(/appears twice/);
  });
});

describe('the months between two dates', () => {
  it('reads about a year for a year', () => {
    expect(monthsBetween('2024-01-01', '2025-01-01')).toBeCloseTo(12, 1);
  });

  it('is negative when the dates are the wrong way round', () => {
    expect(monthsBetween('2025-01-01', '2024-01-01')).toBeLessThan(0);
  });

  it('refuses something that is not a date', () => {
    expect(() => monthsBetween('yesterday', '2025-01-01')).toThrow(/ISO calendar date/);
  });
});

describe('strength over time', () => {
  it('does not move for a stable article', () => {
    expect(strengthNow(salt, 100, 40)).toBe(100);
    expect(DECAY_PER_MONTH.stable).toBe(0);
  });

  it('falls for one that hydrolyses', () => {
    expect(strengthNow(reactive, 100, 10)).toBeCloseTo(94, 9);
  });

  it('never goes below nothing', () => {
    expect(strengthNow(reactive, 100, 500)).toBe(0);
  });

  it('refuses a lot received in the future', () => {
    expect(() => strengthNow(reactive, 100, -1)).toThrow(/has not been received yet/);
  });
});

describe('assessing a lot', () => {
  it('passes a fresh one', () => {
    const result = assess(reactive, { receivedAt: '2025-01-01', strength: 100 }, '2025-03-01');
    expect(result.state).toBe('good');
  });

  it('puts one past its retest date on watch', () => {
    const result = assess(leveller, { receivedAt: '2023-06-01', strength: 100 }, '2024-08-01');
    expect(result.state).toBe('watch');
    expect(result.reason).toMatch(/due a retest/);
  });

  it('sends one that has lost strength for a retest rather than scrapping it', () => {
    const result = assess(reactive, { receivedAt: '2024-01-01', strength: 100 }, '2024-09-01');
    expect(result.state).toBe('retest');
    expect(result.reason).toMatch(/fallen to/);
  });

  it('scraps a weak one that is also past its date', () => {
    const result = assess(reactive, { receivedAt: '2021-01-01', strength: 100 }, '2025-01-01');
    expect(result.state).toBe('scrap');
  });

  it('scraps an emulsion on the date whatever its strength', () => {
    const result = assess(softener, { receivedAt: '2024-01-01', strength: 100 }, '2025-06-01');
    expect(result.state).toBe('scrap');
    expect(result.reason).toMatch(/not recoverable/);
  });

  it('retests a strong article that is past its date', () => {
    const result = assess(salt, { receivedAt: '2019-01-01', strength: 100 }, '2025-01-01');
    expect(result.state).toBe('retest');
    expect(result.reason).toMatch(/past the use by date but still to strength/);
  });

  it('takes a lot with no certificate strength as a hundred', () => {
    expect(assess(salt, { receivedAt: '2025-01-01' }, '2025-02-01').strength).toBe(100);
  });
});

describe('the store walk', () => {
  const lots = [
    { lotId: 'S1', code: 'NACL-IND', receivedAt: '2025-01-01', strength: 100 },
    { lotId: 'S2', code: 'RB-19-ACME', receivedAt: '2023-01-01', strength: 100 },
    { lotId: 'S3', code: 'SOFT-1', receivedAt: '2023-01-01', strength: 100 },
  ];

  it('leaves out everything that is fine', () => {
    const rows = review(book, lots, '2025-04-01');
    expect(rows.map((row) => row.lotId)).not.toContain('S1');
  });

  it('puts the worst first', () => {
    const rows = review(book, lots, '2025-04-01');
    expect(rows[0].state).toBe('scrap');
    expect(STATES).toEqual(['good', 'watch', 'retest', 'scrap']);
  });

  it('refuses a lot of something with no shelf life recorded', () => {
    expect(() =>
      review(book, [{ lotId: 'S9', code: 'MYSTERY', receivedAt: '2025-01-01' }], '2025-04-01')
    ).toThrow(/no shelf life entry/);
  });

  it('reports nothing for a store of fresh stock', () => {
    const fresh = lots.map((lot) => ({ ...lot, receivedAt: '2025-03-01' }));
    expect(review(book, fresh, '2025-04-01')).toEqual([]);
  });
});

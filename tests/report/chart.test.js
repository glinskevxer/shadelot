import { describe, expect, it } from 'vitest';
import {
  histogram,
  histogramLines,
  levels,
  markedLine,
  requireSeries,
  sample,
  sparkline,
} from '../../src/report/chart.js';

describe('the sparkline', () => {
  it('is one character per point', () => {
    expect(sparkline([1, 2, 3, 4])).toHaveLength(4);
  });

  it('rises with the series', () => {
    const line = sparkline([1, 2, 3, 4, 5, 6]);
    const order = levels();
    expect(order.indexOf(line[0])).toBeLessThan(order.indexOf(line.at(-1)));
  });

  it('is flat for a series that does not move', () => {
    expect(sparkline([4, 4, 4])).toBe('___');
  });

  it('takes a single point', () => {
    expect(sparkline([4])).toBe('_');
  });

  it('samples a long series down to a width', () => {
    expect(
      sparkline(
        Array.from({ length: 200 }, (_, i) => i),
        { width: 20 }
      )
    ).toHaveLength(20);
  });

  it('refuses an empty series', () => {
    expect(() => sparkline([])).toThrow(/at least 1 entries/);
  });
});

describe('sampling', () => {
  it('leaves a short series alone', () => {
    expect(sample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('keeps the first and the last point', () => {
    const taken = sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
    expect(taken[0]).toBe(0);
    expect(taken.at(-1)).toBe(9);
    expect(taken).toHaveLength(4);
  });

  it('refuses a width of nothing or a fractional one', () => {
    expect(() => sample([1, 2, 3], 0)).toThrow(/width/);
    expect(() => sample([1, 2, 3], 2.5)).toThrow(/whole number/);
  });
});

describe('the histogram', () => {
  const values = [1, 1, 2, 2, 2, 3, 3, 8];

  it('makes the bins asked for', () => {
    expect(histogram(values, { bins: 4 })).toHaveLength(4);
  });

  it('counts every value exactly once', () => {
    const bars = histogram(values, { bins: 4 });
    expect(bars.reduce((sum, bar) => sum + bar.count, 0)).toBe(values.length);
  });

  it('puts the highest value in the last bin', () => {
    expect(histogram(values, { bins: 4 }).at(-1).count).toBe(1);
  });

  it('draws the tallest bar full width', () => {
    const bars = histogram(values, { bins: 4, width: 10 });
    const tallest = bars.reduce((best, bar) => (bar.count > best.count ? bar : best));
    expect(tallest.bar).toHaveLength(10);
  });

  it('handles a series where every value is the same', () => {
    const bars = histogram([5, 5, 5], { bins: 3 });
    expect(bars.reduce((sum, bar) => sum + bar.count, 0)).toBe(3);
  });

  it('refuses no bins at all', () => {
    expect(() => histogram(values, { bins: 0 })).toThrow(/bins/);
  });
});

describe('printing a histogram', () => {
  it('lines the counts and the bars up', () => {
    const lines = histogramLines(histogram([1, 2, 2, 3, 9], { bins: 4 }));
    const positions = lines.map((line) => line.indexOf('#')).filter((index) => index > 0);
    expect(new Set(positions).size).toBe(1);
  });

  it('takes the places the caller wants on the range', () => {
    expect(histogramLines(histogram([1, 2, 3], { bins: 2 }), { places: 0 })[0]).toMatch(/^1 to 2/);
  });

  it('refuses nothing to print', () => {
    expect(() => histogramLines([])).toThrow(/at least 1 entries/);
  });
});

describe('a marked line', () => {
  it('puts a mark under the point that signalled', () => {
    const values = [1, 2, 3, 9, 3, 2];
    const marked = markedLine(values, [{ at: 3 }]);
    expect(marked.line).toHaveLength(6);
    expect(marked.marks[3]).toBe('^');
    expect(marked.marks.replace(/\^/g, '').trim()).toBe('');
  });

  it('has nothing under a clean series', () => {
    expect(markedLine([1, 2, 3], []).marks.trim()).toBe('');
  });

  it('keeps the marks on the line when the series is sampled down', () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const marked = markedLine(values, [{ at: 99 }], { width: 10 });
    expect(marked.marks).toHaveLength(10);
    expect(marked.marks.at(-1)).toBe('^');
  });
});

describe('the series guard', () => {
  it('takes an absent series as an empty one', () => {
    expect(requireSeries(undefined, 'values')).toEqual([]);
  });

  it('refuses a series with something that is not a number in it', () => {
    expect(() => requireSeries([1, '2'], 'values')).toThrow(/finite numbers only/);
    expect(() => requireSeries([1, Number.NaN], 'values')).toThrow(/finite numbers only/);
  });
});

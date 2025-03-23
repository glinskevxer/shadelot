/**
 * Charts for a terminal.
 *
 * Nobody is going to open a browser to look at twelve numbers. A sparkline and
 * a histogram in the same characters the tables already use are enough to see a
 * drift or a bimodal shade distribution, which is what the numbers alone hide.
 *
 * Everything here is pure text and fixed width, because it has to line up
 * underneath a table.
 */

import {
  FieldError,
  requireArray,
  requireInteger,
  requirePositive,
  optional,
} from '../valid/guards.js';

const BLOCKS = ['_', '.', '-', '=', '*', '#'];

export function sparkline(values, { width } = {}) {
  requireArray(values, 'values', { min: 1 });
  const points = width === undefined ? values : sample(values, width);
  const low = Math.min(...points);
  const high = Math.max(...points);
  if (high === low) {
    return BLOCKS[0].repeat(points.length);
  }
  return points
    .map((value) => {
      const scaled = (value - low) / (high - low);
      const index = Math.min(BLOCKS.length - 1, Math.floor(scaled * BLOCKS.length));
      return BLOCKS[index];
    })
    .join('');
}

/** Take a fixed number of points out of a longer series, evenly spaced. */
export function sample(values, width) {
  requireInteger(width, 'width');
  requirePositive(width, 'width');
  if (values.length <= width) return [...values];
  const step = (values.length - 1) / (width - 1);
  return Array.from({ length: width }, (_, i) => values[Math.round(i * step)]);
}

export function histogram(values, { bins = 8, width = 30 } = {}) {
  requireArray(values, 'values', { min: 1 });
  requireInteger(bins, 'bins');
  requirePositive(bins, 'bins');
  requirePositive(width, 'width');
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const counts = new Array(bins).fill(0);
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor(((value - low) / span) * bins));
    counts[index] += 1;
  }
  const peak = Math.max(...counts);
  return counts.map((count, index) => ({
    from: low + (span / bins) * index,
    to: low + (span / bins) * (index + 1),
    count,
    bar: '#'.repeat(peak === 0 ? 0 : Math.round((count / peak) * width)),
  }));
}

/**
 * A line with the control limits marked, which is what a shade chart wants: the
 * points, and a marker under any that broke a rule.
 */
export function markedLine(values, signals, { width } = {}) {
  const points = width === undefined ? values : sample(values, width);
  const line = sparkline(points);
  const marks = new Array(points.length).fill(' ');
  const scale = points.length / values.length;
  for (const signal of signals) {
    const at = Math.min(points.length - 1, Math.round(signal.at * scale));
    marks[at] = '^';
  }
  return { line, marks: marks.join('') };
}

/** Render a histogram as printable lines with the range down the side. */
export function histogramLines(bars, { places = 2 } = {}) {
  requireArray(bars, 'bars', { min: 1 });
  const label = (bar) => `${bar.from.toFixed(places)} to ${bar.to.toFixed(places)}`;
  const labelWidth = Math.max(...bars.map((bar) => label(bar).length));
  const countWidth = Math.max(...bars.map((bar) => String(bar.count).length));
  return bars.map(
    (bar) =>
      `${label(bar).padEnd(labelWidth)}  ${String(bar.count).padStart(countWidth)}  ${bar.bar}`
  );
}

export function levels() {
  return [...BLOCKS];
}

export function requireSeries(values, name) {
  const series = optional(values, (v) => requireArray(v, name), []);
  if (series.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new FieldError(name, 'must hold finite numbers only', series.length);
  }
  return series;
}

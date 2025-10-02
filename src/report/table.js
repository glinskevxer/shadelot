/**
 * Tables.
 *
 * Everything the program prints is a table, and it is printed to a terminal a
 * supervisor is reading over somebody's shoulder rather than to a report
 * generator. So the columns are sized to the content, numbers are right
 * aligned, and nothing wraps: a wrapped table is unreadable and it is better to
 * clip a label than to lose the grid.
 */

import {
  FieldError,
  requireArray,
  requireInteger,
  requireOneOf,
  optional,
} from '../valid/guards.js';
import { clip } from './format.js';

export const ALIGNMENTS = Object.freeze(['left', 'right']);

export function makeColumn(input) {
  const key = typeof input.key === 'string' ? input.key : null;
  if (!key) {
    throw new FieldError('column.key', 'must be a string', input.key);
  }
  return {
    key,
    heading: optional(input.heading, String, key),
    align: requireOneOf(optional(input.align, String, 'left'), 'column.align', ALIGNMENTS),
    width: optional(input.width, (v) => requireInteger(v, 'column.width'), null),
    format: typeof input.format === 'function' ? input.format : (value) => (value ?? '').toString(),
  };
}

function cellText(column, row) {
  const value = row[column.key];
  const text = column.format(value, row);
  return column.width === null ? text : clip(text, column.width);
}

function widthsFor(columns, rows) {
  return columns.map((column) => {
    const cells = rows.map((row) => cellText(column, row).length);
    const natural = Math.max(column.heading.length, ...cells, 0);
    return column.width === null ? natural : Math.max(column.width, column.heading.length);
  });
}

function pad(text, width, align) {
  return align === 'right' ? text.padStart(width) : text.padEnd(width);
}

export function renderTable(columnSpecs, rows, { gap = 2, rule = true } = {}) {
  requireArray(columnSpecs, 'columns', { min: 1 });
  requireArray(rows, 'rows');
  const columns = columnSpecs.map(makeColumn);
  const widths = widthsFor(columns, rows);
  const separator = ' '.repeat(gap);

  const lines = [];
  lines.push(
    columns
      .map((column, i) => pad(column.heading, widths[i], column.align))
      .join(separator)
      .trimEnd()
  );
  if (rule) {
    lines.push(widths.map((width) => '-'.repeat(width)).join(separator));
  }
  for (const row of rows) {
    lines.push(
      columns
        .map((column, i) => pad(cellText(column, row), widths[i], column.align))
        .join(separator)
        .trimEnd()
    );
  }
  return lines.join('\n');
}

/** A two column key and value block, which is what a single record prints as. */
export function renderRecord(pairs, { gap = 2 } = {}) {
  requireArray(pairs, 'pairs', { min: 1 });
  const width = Math.max(...pairs.map(([label]) => String(label).length));
  return pairs
    .map(([label, value]) => `${String(label).padEnd(width)}${' '.repeat(gap)}${value ?? ''}`)
    .join('\n');
}

/** Rows as json, for anything reading this from a script rather than a screen. */
export function renderJson(columnSpecs, rows) {
  const columns = columnSpecs.map(makeColumn);
  return JSON.stringify(
    rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column.key, row[column.key] ?? null]))
    ),
    null,
    2
  );
}

export const FORMATS = Object.freeze(['table', 'json']);

export function render(format, columns, rows, options) {
  requireOneOf(format, 'format', FORMATS);
  return format === 'json' ? renderJson(columns, rows) : renderTable(columns, rows, options);
}

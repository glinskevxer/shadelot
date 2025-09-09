/**
 * Getting the numbers out.
 *
 * The accounts package wants a file it can import and it does not want json.
 * That is the whole reason this exists, and the whole reason it is fussier than
 * it looks: a comma in a customer name, a quote in a shade name, and a leading
 * equals sign in a batch number all break a spreadsheet in three different
 * ways, and one of them is a security hole rather than a mess.
 */

import { FieldError, requireArray, requireOneOf, requireText, optional } from '../valid/guards.js';

export const DELIMITERS = Object.freeze({ csv: ',', tsv: '\t', psv: '|' });

export function delimiterFor(format) {
  return DELIMITERS[requireOneOf(format, 'format', Object.keys(DELIMITERS))];
}

/** Characters a spreadsheet reads as the start of a formula. */
const FORMULA_STARTS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Quote a single cell. A value that starts like a formula is prefixed with an
 * apostrophe, which is what a spreadsheet reads as "this is text" and what stops
 * an imported file running something.
 */
export function cell(value, delimiter) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  if (FORMULA_STARTS.includes(text[0])) {
    text = `'${text}`;
  }
  const needsQuoting = text.includes(delimiter) || /["\n\r]/.test(text);
  if (!needsQuoting) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function row(values, delimiter) {
  return values.map((value) => cell(value, delimiter)).join(delimiter);
}

/**
 * Render rows against a column list. Columns are named rather than taken off
 * the first row, because a row missing a key would otherwise shift every column
 * after it and nobody would notice until the accounts did.
 */
export function toDelimited(columns, rows, { format = 'csv', header = true, newline = '\n' } = {}) {
  requireArray(columns, 'columns', { min: 1 });
  requireArray(rows, 'rows');
  const delimiter = delimiterFor(format);
  const keys = columns.map((column) => requireText(column.key, 'column.key', { maxLength: 60 }));
  const lines = [];
  if (header) {
    lines.push(
      row(
        columns.map((column) => optional(column.heading, String, column.key)),
        delimiter
      )
    );
  }
  for (const entry of rows) {
    lines.push(
      row(
        keys.map((key) => entry[key]),
        delimiter
      )
    );
  }
  return lines.join(newline) + newline;
}

/** Read one back, which is only used to check what was written. */
export function fromDelimited(text, { format = 'csv' } = {}) {
  const delimiter = delimiterFor(format);
  const lines = text.replace(/\n$/, '').split('\n');
  if (lines.length === 0 || lines[0] === '') {
    throw new FieldError('text', 'holds no rows at all', text.length);
  }
  const parse = (line) => {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const character = line[i];
      if (quoted) {
        if (character === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          current += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === delimiter) {
        values.push(current);
        current = '';
      } else {
        current += character;
      }
    }
    values.push(current);
    return values;
  };
  const [head, ...rest] = lines.map(parse);
  return rest.map((values) =>
    Object.fromEntries(head.map((key, index) => [key, values[index] ?? '']))
  );
}

/** The column sets the accounts package asks for, by name. */
export const EXPORTS = Object.freeze({
  batches: [
    { key: 'id', heading: 'batch' },
    { key: 'machineId', heading: 'machine' },
    { key: 'customer', heading: 'customer' },
    { key: 'band', heading: 'band' },
    { key: 'fibreKg', heading: 'kg in' },
    { key: 'saleableKg', heading: 'kg out' },
    { key: 'cost', heading: 'cost' },
    { key: 'passes', heading: 'passes' },
    { key: 'accepted', heading: 'accepted' },
  ],
  stock: [
    { key: 'lotId', heading: 'lot' },
    { key: 'code', heading: 'article' },
    { key: 'remainingKg', heading: 'on hand' },
    { key: 'pricePerKg', heading: 'price' },
    { key: 'receivedAt', heading: 'received' },
  ],
  deliveries: [
    { key: 'batchId', heading: 'batch' },
    { key: 'metres', heading: 'metres' },
    { key: 'at', heading: 'date' },
    { key: 'note', heading: 'note' },
  ],
});

export function exportNames() {
  return Object.keys(EXPORTS);
}

export function columnsFor(name) {
  const columns = EXPORTS[name];
  if (!columns) {
    throw new FieldError('export', `must be one of ${exportNames().join(', ')}`, name);
  }
  return columns;
}

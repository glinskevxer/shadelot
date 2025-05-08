/**
 * How a command answers.
 *
 * Every command was writing the same four lines: branch on the format, write
 * json and return, otherwise write a summary block, a blank line and a table.
 * Two of them had the blank line in the wrong place and one printed a table
 * with no heading when it had no rows.
 *
 * A command now hands over what it worked out and this decides how it comes
 * out, which is the part that should not be a decision at all.
 */

import { requireOneOf } from '../valid/guards.js';
import { FORMATS, render, renderRecord } from '../report/table.js';

/**
 * Sections are written in the order given. A block is a list of label and value
 * pairs; a table is columns and rows; a note is one line. An empty table is
 * replaced by its `empty` line rather than printed as a bare heading.
 */
export function respond(out, format, { json, sections }) {
  requireOneOf(format, 'format', FORMATS);
  if (format === 'json') {
    out.write(JSON.stringify(json, null, 2));
    return;
  }
  let written = 0;
  for (const section of sections) {
    if (section === null || section === undefined) continue;
    const lines = linesFor(section, format);
    if (lines === null) continue;
    if (written > 0) out.write('');
    out.write(lines);
    written += 1;
  }
}

function linesFor(section, format) {
  if (section.block) {
    const pairs = section.block.filter((pair) => pair !== null && pair !== undefined);
    return pairs.length === 0 ? null : renderRecord(pairs);
  }
  if (section.table) {
    const { columns, rows, empty } = section.table;
    if (rows.length === 0) {
      return empty ?? null;
    }
    return render(format, columns, rows);
  }
  if (section.note) {
    return section.note;
  }
  if (section.lines) {
    return section.lines.join('\n');
  }
  return null;
}

/** A pair for a block, dropped when the value is nothing worth printing. */
export function pair(label, value, { whenEmpty } = {}) {
  if (value === null || value === undefined || value === '') {
    return whenEmpty === undefined ? null : [label, whenEmpty];
  }
  return [label, value];
}

import { describe, expect, it } from 'vitest';
import {
  FORMATS,
  makeColumn,
  render,
  renderJson,
  renderRecord,
  renderTable,
} from '../../src/report/table.js';

const columns = [
  { key: 'code', heading: 'article' },
  { key: 'kg', heading: 'kg', align: 'right', format: (v) => v.toFixed(3) },
];

const rows = [
  { code: 'RB-19', kg: 2.4 },
  { code: 'NACL-INDUSTRIAL', kg: 80 },
];

describe('columns', () => {
  it('take the key as the heading when none is given', () => {
    expect(makeColumn({ key: 'kg' }).heading).toBe('kg');
  });

  it('default to left aligned and unlimited width', () => {
    const column = makeColumn({ key: 'kg' });
    expect(column.align).toBe('left');
    expect(column.width).toBeNull();
  });

  it('refuse an alignment nothing renders', () => {
    expect(() => makeColumn({ key: 'kg', align: 'centre' })).toThrow(/column.align/);
  });

  it('refuse a column with no key', () => {
    expect(() => makeColumn({ heading: 'kg' })).toThrow(/column.key/);
  });
});

describe('rendering a table', () => {
  const text = renderTable(columns, rows);
  const lines = text.split('\n');

  it('puts the headings first and a rule under them', () => {
    expect(lines[0]).toMatch(/^article/);
    expect(lines[1]).toMatch(/^-+/);
  });

  it('sizes each column to its widest cell', () => {
    expect(lines[0].startsWith('article'.padEnd('NACL-INDUSTRIAL'.length))).toBe(true);
  });

  it('right aligns a numeric column', () => {
    expect(lines[2]).toMatch(/ 2\.400$/);
    expect(lines[3]).toMatch(/80\.000$/);
  });

  it('drops the rule when it is not wanted', () => {
    const bare = renderTable(columns, rows, { rule: false }).split('\n');
    expect(bare).toHaveLength(3);
  });

  it('clips a cell to a fixed width rather than wrapping it', () => {
    const narrow = [{ key: 'code', heading: 'article', width: 8 }, columns[1]];
    const text = renderTable(narrow, rows);
    expect(text).toContain('NACL-...');
    expect(text.split('\n')).toHaveLength(4);
  });

  it('never lets a fixed width cut the heading off', () => {
    const narrow = [{ key: 'code', heading: 'article', width: 4 }];
    expect(renderTable(narrow, rows).split('\n')[0]).toBe('article');
  });

  it('renders headings and a rule for no rows at all', () => {
    expect(renderTable(columns, []).split('\n')).toHaveLength(2);
  });

  it('leaves no trailing spaces on any line', () => {
    for (const line of renderTable(columns, rows).split('\n')) {
      expect(line).toBe(line.trimEnd());
    }
  });

  it('refuses a table with no columns', () => {
    expect(() => renderTable([], rows)).toThrow(/at least 1 entries/);
  });

  it('prints an absent value as an empty cell', () => {
    const text = renderTable([{ key: 'code' }, { key: 'missing' }], [{ code: 'X' }]);
    expect(text.split('\n').at(-1)).toBe('X');
  });
});

describe('rendering one record', () => {
  it('lines the values up under each other', () => {
    const text = renderRecord([
      ['batch', 'B25-00301'],
      ['machine', 'JET-4'],
      ['liquor ratio', '8.0'],
    ]);
    const lines = text.split('\n');
    const positions = lines.map((line) => line.indexOf(line.trim().split(/\s{2,}/)[1]));
    expect(new Set(positions).size).toBe(1);
  });

  it('prints an empty value rather than the word undefined', () => {
    expect(renderRecord([['note', undefined]])).toBe('note  ');
  });

  it('refuses an empty record', () => {
    expect(() => renderRecord([])).toThrow(/at least 1 entries/);
  });
});

describe('json output', () => {
  it('carries only the columns asked for', () => {
    const parsed = JSON.parse(renderJson(columns, rows));
    expect(Object.keys(parsed[0])).toEqual(['code', 'kg']);
    expect(parsed[1].kg).toBe(80);
  });

  it('writes a missing value as null rather than leaving the key out', () => {
    const parsed = JSON.parse(renderJson([{ key: 'code' }, { key: 'missing' }], [{ code: 'X' }]));
    expect(parsed[0]).toEqual({ code: 'X', missing: null });
  });

  it('does not format the numbers, since a script wants the number', () => {
    const parsed = JSON.parse(renderJson(columns, rows));
    expect(parsed[0].kg).toBe(2.4);
  });
});

describe('choosing a format', () => {
  it('routes to the one asked for', () => {
    expect(render('table', columns, rows)).toContain('article');
    expect(render('json', columns, rows)).toContain('"code"');
    expect(FORMATS).toEqual(['table', 'json']);
  });

  it('refuses a format nothing writes', () => {
    expect(() => render('csv', columns, rows)).toThrow(/format/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DELIMITERS,
  EXPORTS,
  cell,
  columnsFor,
  delimiterFor,
  exportNames,
  fromDelimited,
  row,
  toDelimited,
} from '../../src/store/export.js';

const columns = [
  { key: 'id', heading: 'batch' },
  { key: 'customer', heading: 'customer' },
  { key: 'cost', heading: 'cost' },
];

describe('the formats', () => {
  it('name the three the accounts package will take', () => {
    expect(exportNames().length).toBeGreaterThan(2);
    expect(Object.keys(DELIMITERS)).toEqual(['csv', 'tsv', 'psv']);
    expect(delimiterFor('tsv')).toBe('\t');
  });

  it('refuse one nothing writes', () => {
    expect(() => delimiterFor('xls')).toThrow(/format/);
  });
});

describe('one cell', () => {
  it('leaves an ordinary value alone', () => {
    expect(cell('Kestrel', ',')).toBe('Kestrel');
    expect(cell(12.5, ',')).toBe('12.5');
  });

  it('writes nothing for nothing', () => {
    expect(cell(null, ',')).toBe('');
    expect(cell(undefined, ',')).toBe('');
  });

  it('quotes a value carrying the delimiter', () => {
    expect(cell('Kestrel, Apparel', ',')).toBe('"Kestrel, Apparel"');
    expect(cell('Kestrel, Apparel', '\t')).toBe('Kestrel, Apparel');
  });

  it('doubles a quote inside a quoted value', () => {
    expect(cell('the "olive" one', ',')).toBe('"the ""olive"" one"');
  });

  it('quotes a value carrying a newline', () => {
    expect(cell('two\nlines', ',')).toBe('"two\nlines"');
  });

  it('defuses a value a spreadsheet would run as a formula', () => {
    expect(cell('=1+1', ',')).toBe("'=1+1");
    expect(cell('+44 161', ',')).toBe("'+44 161");
    expect(cell('-1', ',')).toBe("'-1");
    expect(cell('@here', ',')).toBe("'@here");
  });

  it('leaves a number that happens to be negative alone', () => {
    expect(cell(-1, ',')).toBe("'-1");
  });

  it('joins a row with the delimiter', () => {
    expect(row(['a', 'b'], ',')).toBe('a,b');
    expect(row(['a,b', 'c'], ',')).toBe('"a,b",c');
  });
});

describe('rendering rows', () => {
  const rows = [
    { id: 'B25-00301', customer: 'Kestrel Apparel', cost: 420.5 },
    { id: 'B25-00302', customer: 'Marlow, Uniforms', cost: 318 },
  ];

  it('writes the headings and one line per row', () => {
    const text = toDelimited(columns, rows);
    expect(text.split('\n')).toHaveLength(4);
    expect(text.split('\n')[0]).toBe('batch,customer,cost');
  });

  it('ends in a newline, like everything else here', () => {
    expect(toDelimited(columns, rows).endsWith('\n')).toBe(true);
  });

  it('leaves the headings off when they are not wanted', () => {
    expect(toDelimited(columns, rows, { header: false }).split('\n')[0]).toMatch(/^B25-00301/);
  });

  it('takes the key as the heading when none is given', () => {
    expect(toDelimited([{ key: 'id' }], rows).split('\n')[0]).toBe('id');
  });

  it('never shifts a column when a row is missing a key', () => {
    const text = toDelimited(columns, [{ id: 'B1' }, { id: 'B2', cost: 10 }]);
    for (const line of text.trim().split('\n')) {
      expect(line.split(',').length).toBe(3);
    }
  });

  it('writes another delimiter when asked', () => {
    expect(toDelimited(columns, rows, { format: 'tsv' }).split('\n')[0]).toBe(
      'batch\tcustomer\tcost'
    );
  });

  it('refuses a table with no columns', () => {
    expect(() => toDelimited([], rows)).toThrow(/at least 1 entries/);
  });

  it('takes a table with no rows and still writes the headings', () => {
    expect(toDelimited(columns, [])).toBe('batch,customer,cost\n');
  });
});

describe('reading one back', () => {
  const rows = [
    { id: 'B25-00301', customer: 'Kestrel Apparel', cost: '420.5' },
    { id: 'B25-00302', customer: 'Marlow, Uniforms', cost: '318' },
  ];

  it('round trips ordinary rows', () => {
    const text = toDelimited([{ key: 'id' }, { key: 'customer' }, { key: 'cost' }], rows);
    expect(fromDelimited(text)).toEqual(rows);
  });

  it('round trips a value carrying the delimiter and a quote', () => {
    const awkward = [{ id: 'B1', customer: 'the "olive, one"' }];
    const text = toDelimited([{ key: 'id' }, { key: 'customer' }], awkward);
    expect(fromDelimited(text)).toEqual(awkward);
  });

  it('fills a short row rather than dropping the key', () => {
    expect(fromDelimited('a,b\n1\n')).toEqual([{ a: '1', b: '' }]);
  });

  it('refuses text with nothing in it', () => {
    expect(() => fromDelimited('')).toThrow(/no rows at all/);
  });
});

describe('the column sets the accounts ask for', () => {
  it('name one per export', () => {
    expect(exportNames()).toEqual(['batches', 'stock', 'deliveries']);
    expect(columnsFor('stock').map((column) => column.key)).toContain('remainingKg');
  });

  it('give every column a key and a heading', () => {
    for (const [name, set] of Object.entries(EXPORTS)) {
      for (const column of set) {
        expect(typeof column.key, name).toBe('string');
        expect(typeof column.heading, name).toBe('string');
      }
    }
  });

  it('refuse an export nothing writes', () => {
    expect(() => columnsFor('invoices')).toThrow(/must be one of batches/);
  });
});

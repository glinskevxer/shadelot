import { describe, expect, it } from 'vitest';
import { createOutput } from '../../src/cli/io.js';
import { pair, respond } from '../../src/cli/report.js';

const columns = [
  { key: 'code', heading: 'article' },
  { key: 'kg', heading: 'kg', align: 'right', format: (v) => v.toFixed(3) },
];
const rows = [
  { code: 'RB-19', kg: 2.4 },
  { code: 'NACL', kg: 80 },
];

describe('answering as json', () => {
  it('writes the document and nothing else', () => {
    const out = createOutput();
    respond(out, 'json', {
      json: { fibreKg: 200 },
      sections: [{ block: [['load', '200 kg']] }, { table: { columns, rows } }],
    });
    expect(out.lines).toHaveLength(1);
    expect(JSON.parse(out.text())).toEqual({ fibreKg: 200 });
  });
});

describe('answering as a table', () => {
  it('writes the sections in the order they were given', () => {
    const out = createOutput();
    respond(out, 'table', {
      json: {},
      sections: [{ block: [['load', '200 kg']] }, { table: { columns, rows } }],
    });
    expect(out.text()).toMatch(/^load\s+200 kg/);
    expect(out.text()).toMatch(/article/);
  });

  it('puts exactly one blank line between sections', () => {
    const out = createOutput();
    respond(out, 'table', {
      json: {},
      sections: [{ note: 'first' }, { note: 'second' }, { note: 'third' }],
    });
    expect(out.lines).toEqual(['first', '', 'second', '', 'third']);
  });

  it('never leads with a blank line', () => {
    const out = createOutput();
    respond(out, 'table', { json: {}, sections: [null, { note: 'first' }] });
    expect(out.lines[0]).toBe('first');
  });

  it('replaces an empty table with its own line rather than a bare heading', () => {
    const out = createOutput();
    respond(out, 'table', {
      json: {},
      sections: [{ table: { columns, rows: [], empty: 'nothing to dispense' } }],
    });
    expect(out.text()).toBe('nothing to dispense');
  });

  it('leaves an empty table out entirely when it has nothing to say', () => {
    const out = createOutput();
    respond(out, 'table', {
      json: {},
      sections: [{ note: 'first' }, { table: { columns, rows: [] } }],
    });
    expect(out.lines).toEqual(['first']);
  });

  it('drops an empty block rather than printing an empty line', () => {
    const out = createOutput();
    respond(out, 'table', { json: {}, sections: [{ block: [null, null] }, { note: 'first' }] });
    expect(out.lines).toEqual(['first']);
  });

  it('writes a list of lines as it was given', () => {
    const out = createOutput();
    respond(out, 'table', { json: {}, sections: [{ lines: ['a', 'b'] }] });
    expect(out.text()).toBe('a\nb');
  });

  it('refuses a format nothing writes', () => {
    expect(() => respond(createOutput(), 'csv', { json: {}, sections: [] })).toThrow(/format/);
  });
});

describe('the pair helper', () => {
  it('keeps a value worth printing', () => {
    expect(pair('load', '200 kg')).toEqual(['load', '200 kg']);
    expect(pair('load', 0)).toEqual(['load', 0]);
  });

  it('drops one that is nothing', () => {
    expect(pair('note', null)).toBeNull();
    expect(pair('note', undefined)).toBeNull();
    expect(pair('note', '')).toBeNull();
  });

  it('substitutes when the caller wants a line either way', () => {
    expect(pair('note', null, { whenEmpty: 'none' })).toEqual(['note', 'none']);
  });
});

describe('what the commands now share', () => {
  it('is being moved onto, with the count of the ones left going down', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const directory = fileURLToPath(new URL('../../src/cli/commands', import.meta.url));
    const stragglers = readdirSync(directory)
      .filter((name) => name.endsWith('.js') && name !== 'index.js')
      .filter((name) => {
        const text = readFileSync(join(directory, name), 'utf8');
        return text.includes("options.format === 'json'");
      });
    expect(stragglers.length).toBeLessThanOrEqual(10);
  });

  it('leaves no command writing its own blank line between two tables', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const directory = fileURLToPath(new URL('../../src/cli/commands', import.meta.url));
    for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.js'))) {
      const text = readFileSync(join(directory, name), 'utf8');
      if (text.includes('respond(out')) {
        expect(text.includes("out.write('');"), `${name} writes its own blank line`).toBe(false);
      }
    }
  });
});

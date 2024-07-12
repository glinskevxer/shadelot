import { describe, expect, it } from 'vitest';
import * as shadelot from '../src/index.js';

const expected = [
  'batch',
  'card',
  'chemical',
  'continuity',
  'correction',
  'cost',
  'curve',
  'deltae',
  'depth',
  'dyestuff',
  'effluent',
  'fabric',
  'format',
  'guards',
  'ids',
  'lab',
  'labdip',
  'lot',
  'machine',
  'recipe',
  'reflectance',
  'register',
  'roll',
  'rounding',
  'stock',
  'store',
  'strength',
  'table',
  'tolerance',
  'units',
  'water',
  'energy',
];

describe('the public surface', () => {
  it('exports every namespace the command line reaches for', () => {
    for (const key of expected) {
      expect(shadelot[key], `missing export ${key}`).toBeTypeOf('object');
    }
  });

  it('exports nothing that is empty', () => {
    for (const [key, value] of Object.entries(shadelot)) {
      expect(Object.keys(value).length, `${key} exports nothing`).toBeGreaterThan(0);
    }
  });

  it('carries no name twice under two spellings', () => {
    const keys = Object.keys(shadelot);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reaches the same function through the namespace as through the file', async () => {
    const direct = await import('../src/colour/deltae.js');
    expect(shadelot.deltae.deltaE76).toBe(direct.deltaE76);
  });
});

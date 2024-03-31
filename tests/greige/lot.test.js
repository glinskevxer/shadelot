import { describe, expect, it } from 'vitest';
import { makeRoll } from '../../src/greige/roll.js';
import {
  BINDING_FIELDS,
  canShareLot,
  compatibilityKey,
  fitsMachine,
  groupIntoLots,
  makeLot,
} from '../../src/greige/lot.js';

const template = {
  quality: 'combed poplin 40s',
  construction: 'woven',
  blend: { cotton: 97, elastane: 3 },
  length: 100,
  widthCm: 150,
  gsm: 200,
};

const roll = (id, extra = {}) => ({ ...makeRoll({ ...template, id, ...extra }), ...extra });

describe('the compatibility key', () => {
  it('is built from the fields that bind a lot', () => {
    expect(BINDING_FIELDS).toEqual(['quality', 'construction', 'widthCm']);
    const key = compatibilityKey(roll('A'));
    for (const field of BINDING_FIELDS) {
      expect(key).toContain(field);
    }
  });

  it('does not care about the roll number or the length', () => {
    expect(canShareLot(roll('A'), roll('B', { length: 40 }))).toBe(true);
  });

  it('separates two widths of the same quality', () => {
    expect(canShareLot(roll('A'), roll('B', { widthCm: 148 }))).toBe(false);
  });

  it('separates the same fibres mixed in different shares', () => {
    const other = roll('B', { blend: { cotton: 95, elastane: 5 } });
    expect(canShareLot(roll('A'), other)).toBe(false);
  });

  it('separates beams by default, and joins them when told to', () => {
    const a = roll('A', { beam: 'W-88' });
    const b = roll('B', { beam: 'W-91' });
    expect(canShareLot(a, b)).toBe(false);
    expect(canShareLot(a, b, { separateBeams: false })).toBe(true);
  });
});

describe('grouping a delivery', () => {
  it('splits a mixed pile into the lots it may form', () => {
    const pile = [roll('A'), roll('B', { widthCm: 148 }), roll('C'), roll('D', { widthCm: 148 })];
    const groups = groupIntoLots(pile);
    expect(groups).toHaveLength(2);
    expect(groups[0].rolls.map((r) => r.id)).toEqual(['A', 'C']);
    expect(groups[1].rolls.map((r) => r.id)).toEqual(['B', 'D']);
  });

  it('keeps the rack order inside a group', () => {
    const pile = [roll('C'), roll('A'), roll('B')];
    expect(groupIntoLots(pile)[0].rolls.map((r) => r.id)).toEqual(['C', 'A', 'B']);
  });

  it('will not group nothing', () => {
    expect(() => groupIntoLots([])).toThrow(/at least 1 entries/);
  });
});

describe('making a lot', () => {
  it('totals the mass and the length off the rolls', () => {
    const lot = makeLot({
      id: 'G25-00012',
      customer: 'Kestrel Apparel',
      rolls: [roll('A'), roll('B')],
    });
    expect(lot.mass).toBeCloseTo(60, 9);
    expect(lot.length).toBe(200);
    expect(lot.rollCount).toBe(2);
  });

  it('refuses a roll that cannot legally sit with the others, and names it', () => {
    expect(() =>
      makeLot({
        id: 'G25-00013',
        customer: 'Kestrel Apparel',
        rolls: [roll('A'), roll('X', { widthCm: 120 })],
      })
    ).toThrow(/roll X which cannot share a lot/);
  });

  it('is frozen down to the roll list', () => {
    const lot = makeLot({ id: 'G25-00014', customer: 'Kestrel', rolls: [roll('A')] });
    expect(Object.isFrozen(lot)).toBe(true);
    expect(Object.isFrozen(lot.rolls)).toBe(true);
  });

  it('needs a customer and at least one roll', () => {
    expect(() => makeLot({ id: 'G25-1', customer: '', rolls: [roll('A')] })).toThrow(/customer/);
    expect(() => makeLot({ id: 'G25-1', customer: 'K', rolls: [] })).toThrow(/lot.rolls/);
  });
});

describe('whether a lot fits a machine', () => {
  const machine = { minLoadKg: 40, maxLoadKg: 200 };

  it('rejects a load under the minimum, which would run light', () => {
    const lot = makeLot({ id: 'G25-1', customer: 'K', rolls: [roll('A')] });
    expect(fitsMachine(lot, machine)).toBe(false);
  });

  it('takes a load inside the band', () => {
    const rolls = ['A', 'B', 'C'].map((id) => roll(id));
    const lot = makeLot({ id: 'G25-2', customer: 'K', rolls });
    expect(fitsMachine(lot, machine)).toBe(true);
  });

  it('refuses to answer for a machine with no band', () => {
    const lot = makeLot({ id: 'G25-3', customer: 'K', rolls: [roll('A')] });
    expect(() => fitsMachine(lot, { minLoadKg: 0, maxLoadKg: 200 })).toThrow(/minLoadKg/);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { makeLab } from '../../src/colour/lab.js';
import { makeTolerance } from '../../src/colour/tolerance.js';
import {
  makeOrder,
  recordBatch,
  rejectedBatches,
  rightFirstTime,
  shadeBand,
} from '../../src/shade/continuity.js';

const standard = makeLab(52.1, -14.3, 22.7);
const tolerance = makeTolerance({ name: 'Kestrel', formula: 'cie76', total: 1 });
const base = { id: 'O25-0900', customer: 'Kestrel Apparel', standard, tolerance };

describe('opening an order', () => {
  it('sets the continuity limit tighter than the standard tolerance', () => {
    const order = makeOrder(base);
    expect(order.continuityLimit).toBeCloseTo(0.6, 9);
    expect(order.reference).toBeNull();
  });

  it('refuses a continuity limit looser than the tolerance, which would mean nothing', () => {
    expect(() => makeOrder({ ...base, continuityLimit: 1.5 })).toThrow(/must be tighter/);
  });

  it('takes a tighter limit when the customer asks', () => {
    expect(makeOrder({ ...base, continuityLimit: 0.3 }).continuityLimit).toBe(0.3);
  });

  it('needs a standard and a tolerance block', () => {
    expect(() => makeOrder({ ...base, standard: 'olive' })).toThrow(/order.standard/);
    expect(() => makeOrder({ ...base, tolerance: null })).toThrow(/order.tolerance/);
  });
});

describe('recording batches', () => {
  let order;
  beforeEach(() => {
    order = makeOrder(base);
  });

  it('makes the first accepted batch the reference', () => {
    const first = recordBatch(order, { batchId: 'B1', reading: makeLab(52.3, -14.3, 22.7) });
    expect(first.againstReference).toBeNull();
    expect(order.reference.batchId).toBe('B1');
  });

  it('does not make a rejected first batch the reference', () => {
    recordBatch(order, { batchId: 'B1', reading: makeLab(55, -14.3, 22.7) });
    expect(order.reference).toBeNull();
    const second = recordBatch(order, { batchId: 'B2', reading: makeLab(52.2, -14.3, 22.7) });
    expect(order.reference.batchId).toBe('B2');
    expect(second.againstReference).toBeNull();
  });

  it('keeps the first reference even when a later batch sits closer to the standard', () => {
    recordBatch(order, { batchId: 'B1', reading: makeLab(52.8, -14.3, 22.7) });
    recordBatch(order, { batchId: 'B2', reading: makeLab(52.1, -14.3, 22.7) });
    expect(order.reference.batchId).toBe('B1');
  });

  it('fails a batch inside the standard tolerance but away from the reference', () => {
    recordBatch(order, { batchId: 'B1', reading: makeLab(51.3, -14.3, 22.7) });
    const second = recordBatch(order, { batchId: 'B2', reading: makeLab(52.9, -14.3, 22.7) });
    expect(second.withinStandard).toBe(true);
    expect(second.withinContinuity).toBe(false);
    expect(second.accepted).toBe(false);
  });

  it('fails a batch outside the standard tolerance whatever the reference says', () => {
    recordBatch(order, { batchId: 'B1', reading: makeLab(52.1, -14.3, 22.7) });
    const second = recordBatch(order, { batchId: 'B2', reading: makeLab(54, -14.3, 22.7) });
    expect(second.withinStandard).toBe(false);
    expect(second.accepted).toBe(false);
  });

  it('refuses the same batch number twice', () => {
    recordBatch(order, { batchId: 'B1', reading: standard });
    expect(() => recordBatch(order, { batchId: 'B1', reading: standard })).toThrow(
      /already on this order/
    );
  });

  it('refuses a reading that is not one', () => {
    expect(() => recordBatch(order, { batchId: 'B9', reading: { L: null } })).toThrow(
      /batch.reading/
    );
  });
});

describe('the shade band', () => {
  let order;
  beforeEach(() => {
    order = makeOrder(base);
    recordBatch(order, { batchId: 'B1', reading: makeLab(52.1, -14.3, 22.7) });
    recordBatch(order, { batchId: 'B2', reading: makeLab(52.3, -14.3, 22.7) });
    recordBatch(order, { batchId: 'B3', reading: makeLab(51.9, -14.3, 22.7) });
  });

  it('centres on the accepted batches and reports the spread', () => {
    const band = shadeBand(order);
    expect(band.count).toBe(3);
    expect(band.centre.L).toBeCloseTo(52.1, 9);
    expect(band.widest).toBeCloseTo(0.2, 6);
  });

  it('leaves a rejected batch out of the band', () => {
    recordBatch(order, { batchId: 'B4', reading: makeLab(56, -14.3, 22.7) });
    expect(shadeBand(order).count).toBe(3);
    expect(rejectedBatches(order).map((b) => b.batchId)).toEqual(['B4']);
  });

  it('will not report a band when nothing has been accepted', () => {
    const empty = makeOrder(base);
    recordBatch(empty, { batchId: 'B9', reading: makeLab(60, -14.3, 22.7) });
    expect(() => shadeBand(empty)).toThrow(/at least 1 entries/);
  });
});

describe('right first time', () => {
  it('is null before anything has run', () => {
    expect(rightFirstTime(makeOrder(base))).toBeNull();
  });

  it('is the accepted share of everything recorded', () => {
    const order = makeOrder(base);
    recordBatch(order, { batchId: 'B1', reading: makeLab(52.1, -14.3, 22.7) });
    recordBatch(order, { batchId: 'B2', reading: makeLab(56, -14.3, 22.7) });
    expect(rightFirstTime(order)).toBeCloseTo(0.5, 9);
  });
});

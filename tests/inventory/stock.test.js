import { beforeEach, describe, expect, it } from 'vitest';
import {
  belowReorder,
  createStock,
  issue,
  lotsFor,
  onHand,
  receiveLot,
  returnToStock,
  valueOnHand,
} from '../../src/inventory/stock.js';

describe('receiving', () => {
  let stock;
  beforeEach(() => {
    stock = createStock();
  });

  it('opens a lot with its full quantity remaining', () => {
    const lot = receiveLot(stock, { lotId: 'L1', code: 'RB-19', quantityKg: 25, pricePerKg: 24 });
    expect(lot.remainingKg).toBe(25);
    expect(lot.strength).toBe(100);
    expect(onHand(stock, 'RB-19')).toBe(25);
  });

  it('records the lot strength when the certificate carries one', () => {
    const lot = receiveLot(stock, {
      lotId: 'L1',
      code: 'RB-19',
      quantityKg: 25,
      pricePerKg: 24,
      strength: 98.5,
    });
    expect(lot.strength).toBe(98.5);
  });

  it('refuses the same lot number twice', () => {
    receiveLot(stock, { lotId: 'L1', code: 'RB-19', quantityKg: 25, pricePerKg: 24 });
    expect(() =>
      receiveLot(stock, { lotId: 'L1', code: 'RY-145', quantityKg: 25, pricePerKg: 20 })
    ).toThrow(/already in stock/);
  });

  it('refuses a lot with no quantity or no price', () => {
    expect(() =>
      receiveLot(stock, { lotId: 'L2', code: 'X', quantityKg: 0, pricePerKg: 1 })
    ).toThrow(/quantityKg/);
    expect(() =>
      receiveLot(stock, { lotId: 'L2', code: 'X', quantityKg: 1, pricePerKg: 0 })
    ).toThrow(/pricePerKg/);
  });
});

describe('issuing', () => {
  let stock;
  beforeEach(() => {
    stock = createStock();
    receiveLot(stock, {
      lotId: 'L1',
      code: 'RB-19',
      quantityKg: 10,
      pricePerKg: 24,
      receivedAt: '2025-01-04',
    });
    receiveLot(stock, {
      lotId: 'L2',
      code: 'RB-19',
      quantityKg: 25,
      pricePerKg: 21,
      receivedAt: '2025-03-11',
    });
  });

  it('draws the oldest lot first by default', () => {
    const drawn = issue(stock, 'RB-19', 6);
    expect(drawn.drawn).toEqual([{ lotId: 'L1', kg: 6, pricePerKg: 24, strength: 100 }]);
    expect(onHand(stock, 'RB-19')).toBe(29);
  });

  it('runs across lots when one is not enough', () => {
    const drawn = issue(stock, 'RB-19', 18);
    expect(drawn.drawn.map((line) => line.lotId)).toEqual(['L1', 'L2']);
    expect(drawn.drawn[1].kg).toBe(8);
  });

  it('costs each part at the lot it came from', () => {
    const drawn = issue(stock, 'RB-19', 18);
    expect(drawn.cost).toBeCloseTo(10 * 24 + 8 * 21, 9);
  });

  it('draws the cheapest first when asked', () => {
    const drawn = issue(stock, 'RB-19', 6, { order: 'cheapest' });
    expect(drawn.drawn[0].lotId).toBe('L2');
  });

  it('refuses an order it does not know', () => {
    expect(() => lotsFor(stock, 'RB-19', { order: 'newest' })).toThrow(/oldest or cheapest/);
  });

  it('draws nothing at all when it cannot fill the issue', () => {
    expect(() => issue(stock, 'RB-19', 40)).toThrow(/more than the 35.000 kg on hand/);
    expect(onHand(stock, 'RB-19')).toBe(35);
  });

  it('says so for a code that was never stocked', () => {
    expect(() => issue(stock, 'RY-145', 1)).toThrow(/0.000 kg on hand for RY-145/);
  });

  it('keeps the batch the issue was for on the movement', () => {
    issue(stock, 'RB-19', 3, { batchId: 'B25-00301' });
    expect(stock.movements.at(-1).batchId).toBe('B25-00301');
  });

  it('leaves an emptied lot out of the next draw', () => {
    issue(stock, 'RB-19', 10);
    expect(lotsFor(stock, 'RB-19').map((lot) => lot.lotId)).toEqual(['L2']);
  });
});

describe('returns', () => {
  let stock;
  beforeEach(() => {
    stock = createStock();
    receiveLot(stock, { lotId: 'L1', code: 'RB-19', quantityKg: 10, pricePerKg: 24 });
    issue(stock, 'RB-19', 4);
  });

  it('puts an unused dispense back on its own lot', () => {
    returnToStock(stock, 'L1', 4);
    expect(onHand(stock, 'RB-19')).toBe(10);
  });

  it('refuses to put back more than was ever taken out', () => {
    expect(() => returnToStock(stock, 'L1', 5)).toThrow(/more back than was ever issued/);
  });

  it('refuses a lot that is not there', () => {
    expect(() => returnToStock(stock, 'L9', 1)).toThrow(/is not in stock/);
  });
});

describe('what the stock is worth', () => {
  let stock;
  beforeEach(() => {
    stock = createStock();
    receiveLot(stock, { lotId: 'L1', code: 'RB-19', quantityKg: 10, pricePerKg: 24 });
    receiveLot(stock, { lotId: 'L2', code: 'RY-145', quantityKg: 5, pricePerKg: 20 });
  });

  it('values one code or all of them', () => {
    expect(valueOnHand(stock, 'RB-19')).toBe(240);
    expect(valueOnHand(stock)).toBe(340);
  });

  it('drops as stock is issued', () => {
    issue(stock, 'RB-19', 5);
    expect(valueOnHand(stock, 'RB-19')).toBe(120);
  });
});

describe('reorder', () => {
  it('lists what is short, worst first', () => {
    const stock = createStock();
    receiveLot(stock, { lotId: 'L1', code: 'RB-19', quantityKg: 2, pricePerKg: 24 });
    receiveLot(stock, { lotId: 'L2', code: 'RY-145', quantityKg: 9, pricePerKg: 20 });
    const short = belowReorder(stock, { 'RB-19': 10, 'RY-145': 10, 'RR-195': 4 });
    expect(short.map((row) => row.code)).toEqual(['RB-19', 'RR-195', 'RY-145']);
    expect(short[0].shortBy).toBe(8);
  });

  it('says nothing when everything is in', () => {
    const stock = createStock();
    receiveLot(stock, { lotId: 'L1', code: 'RB-19', quantityKg: 30, pricePerKg: 24 });
    expect(belowReorder(stock, { 'RB-19': 10 })).toEqual([]);
  });

  it('refuses a negative reorder point', () => {
    expect(() => belowReorder(createStock(), { 'RB-19': -1 })).toThrow(/reorderPoints.RB-19/);
  });
});

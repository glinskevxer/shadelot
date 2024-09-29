import { describe, expect, it } from 'vitest';
import {
  SURCHARGES,
  invoiceBatch,
  invoiceOrder,
  isSmallLot,
  makeRateCard,
} from '../../src/invoice/invoice.js';

const cardInput = {
  name: 'Kestrel 2025',
  perBand: { pale: 1.1, light: 1.25, medium: 1.4, dark: 1.7, heavy: 2.05 },
  surcharges: { 'small-lot': 0.35, rush: 0.5, 're-dye': 0.9 },
  minimumLotKg: 60,
  minimumCharge: 90,
};

const rateCard = makeRateCard(cardInput);

describe('the rate card', () => {
  it('needs a rate for every depth band', () => {
    expect(() =>
      makeRateCard({ ...cardInput, perBand: { pale: 1.1, light: 1.25, medium: 1.4, dark: 1.7 } })
    ).toThrow(/perBand.heavy/);
  });

  it('leaves a surcharge unpriced rather than free', () => {
    expect(rateCard.surcharges.sampling).toBe(0);
    expect(SURCHARGES).toContain('special-finish');
  });

  it('charges seconds at half rate unless told otherwise', () => {
    expect(rateCard.secondsRate).toBe(0.5);
    expect(makeRateCard({ ...cardInput, secondsRate: 0.6 }).secondsRate).toBe(0.6);
  });

  it('refuses a seconds rate above the full rate', () => {
    expect(() => makeRateCard({ ...cardInput, secondsRate: 1.2 })).toThrow(/secondsRate/);
  });
});

describe('one batch', () => {
  it('charges the band rate on the firsts', () => {
    const row = invoiceBatch(rateCard, { id: 'B1', band: 'medium', firstsKg: 200 });
    expect(row.value).toBeCloseTo(280, 9);
    expect(row.lines).toHaveLength(1);
  });

  it('splits firsts from seconds on separate lines', () => {
    const row = invoiceBatch(rateCard, { id: 'B1', band: 'medium', firstsKg: 180, secondsKg: 20 });
    expect(row.lines.map((line) => line.kind)).toEqual(['firsts', 'seconds']);
    expect(row.lines[1].rate).toBeCloseTo(0.7, 9);
  });

  it('charges the seconds rather than giving them away', () => {
    const row = invoiceBatch(rateCard, { id: 'B1', band: 'medium', secondsKg: 200 });
    expect(row.value).toBeCloseTo(140, 9);
  });

  it('adds a surcharge to the rate on both lines', () => {
    const row = invoiceBatch(rateCard, {
      id: 'B1',
      band: 'medium',
      firstsKg: 100,
      secondsKg: 100,
      surcharges: ['rush'],
    });
    expect(row.lines[0].rate).toBeCloseTo(1.9, 9);
    expect(row.lines[1].rate).toBeCloseTo(0.95, 9);
  });

  it('stacks two surcharges', () => {
    const row = invoiceBatch(rateCard, {
      id: 'B1',
      band: 'pale',
      firstsKg: 100,
      surcharges: ['rush', 'small-lot'],
    });
    expect(row.lines[0].rate).toBeCloseTo(1.1 + 0.5 + 0.35, 9);
  });

  it('refuses a surcharge the card does not price', () => {
    expect(() =>
      invoiceBatch(rateCard, { id: 'B1', band: 'pale', firstsKg: 100, surcharges: ['sampling'] })
    ).toThrow(/sampling is not priced/);
  });

  it('refuses a surcharge nothing on the works charges', () => {
    expect(() =>
      invoiceBatch(rateCard, { id: 'B1', band: 'pale', firstsKg: 100, surcharges: ['weekend'] })
    ).toThrow(/surcharge/);
  });

  it('lifts a tiny batch to the minimum charge and says it did', () => {
    const row = invoiceBatch(rateCard, { id: 'B1', band: 'pale', firstsKg: 10 });
    expect(row.value).toBe(90);
    expect(row.atMinimum).toBe(true);
  });

  it('leaves a normal batch off the minimum', () => {
    expect(invoiceBatch(rateCard, { id: 'B1', band: 'medium', firstsKg: 200 }).atMinimum).toBe(
      false
    );
  });

  it('refuses a batch with no cloth on it', () => {
    expect(() => invoiceBatch(rateCard, { id: 'B1', band: 'medium' })).toThrow(/no cloth on it/);
  });

  it('refuses a band nothing grades to', () => {
    expect(() => invoiceBatch(rateCard, { id: 'B1', band: 'black', firstsKg: 10 })).toThrow(
      /batch.band/
    );
  });
});

describe('a whole invoice', () => {
  const invoice = invoiceOrder(rateCard, {
    number: 'I25-0410',
    customer: 'Kestrel Apparel',
    batches: [
      { id: 'B1', band: 'medium', firstsKg: 200 },
      { id: 'B2', band: 'dark', firstsKg: 180, secondsKg: 20 },
    ],
  });

  it('totals the batches', () => {
    expect(invoice.kg).toBe(400);
    expect(invoice.net).toBeCloseTo(280 + 180 * 1.7 + 20 * 0.85, 6);
  });

  it('names the rate card it was priced on', () => {
    expect(invoice.rateCard).toBe('Kestrel 2025');
  });

  it('keeps every batch as its own row', () => {
    expect(invoice.batches.map((row) => row.batchId)).toEqual(['B1', 'B2']);
  });

  it('refuses an invoice with no batches', () => {
    expect(() => invoiceOrder(rateCard, { number: 'I1', customer: 'K', batches: [] })).toThrow(
      /at least 1 entries/
    );
  });
});

describe('the small lot test', () => {
  it('reads off the rate card rather than a constant', () => {
    expect(isSmallLot(rateCard, 40)).toBe(true);
    expect(isSmallLot(rateCard, 60)).toBe(false);
  });
});

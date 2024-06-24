import { describe, expect, it } from 'vitest';
import { createChemicalStore, makeChemical } from '../../src/chemical/catalogue.js';
import {
  PARAMETERS,
  batchLoad,
  checkConsent,
  headroom,
  makeConsent,
  totalDay,
} from '../../src/effluent/load.js';

const chemicals = createChemicalStore([
  makeChemical({ code: 'NACL', name: 'Salt', role: 'salt', basis: 'gpl', pricePerKg: 0.12 }),
  makeChemical({ code: 'SODA', name: 'Soda ash', role: 'alkali', basis: 'gpl', pricePerKg: 0.42 }),
  makeChemical({
    code: 'WET-4',
    name: 'Wetter',
    role: 'wetting',
    basis: 'owf',
    pricePerKg: 3,
    codLoad: 1.4,
  }),
]);

const card = {
  lines: [
    { kind: 'dye', code: 'RB-19', kg: 4 },
    { kind: 'electrolyte', code: 'NACL', kg: 80 },
    { kind: 'electrolyte', code: 'SODA', kg: 20 },
    { kind: 'auxiliary', code: 'WET-4', kg: 2 },
  ],
};

const consent = makeConsent({
  name: 'trade effluent consent 4471',
  volumeM3: 300,
  codKg: 400,
  tdsKg: 900,
  colourUnits: 60,
});

describe('the consent', () => {
  it('defaults the ph window to six to nine', () => {
    expect(consent.phLow).toBe(6);
    expect(consent.phHigh).toBe(9);
  });

  it('refuses a limit of zero', () => {
    expect(() => makeConsent({ ...consent, codKg: 0 })).toThrow(/codKg/);
  });

  it('refuses a ph outside the scale', () => {
    expect(() => makeConsent({ ...consent, phHigh: 15 })).toThrow(/phHigh/);
    expect(PARAMETERS).toEqual(['volume', 'cod', 'tds', 'colour', 'ph']);
  });
});

describe('one batch', () => {
  const load = batchLoad({ water: { net: 7200 }, card, chemicals });

  it('takes the volume off the water account', () => {
    expect(load.volumeM3).toBeCloseTo(7.2, 9);
  });

  it('counts only the unfixed dye as colour', () => {
    expect(load.unfixedKg).toBeCloseTo(1, 9);
    expect(load.colourUnits).toBeCloseTo(1000 / 7.2, 6);
  });

  it('counts salt and alkali towards dissolved solids and nothing else', () => {
    expect(load.tdsKg).toBeCloseTo(100, 9);
  });

  it('reads the demand off each chemical and adds the unfixed dye', () => {
    expect(load.codKg).toBeCloseTo(2 * 1.4 + 1 * 1.6, 9);
  });

  it('puts more colour down the drain at a lower fixation', () => {
    const poor = batchLoad({ water: { net: 7200 }, card, chemicals, fixation: 0.5 });
    expect(poor.unfixedKg).toBeGreaterThan(load.unfixedKg);
    expect(poor.codKg).toBeGreaterThan(load.codKg);
  });

  it('handles a card with no chemical store behind it', () => {
    const bare = batchLoad({ water: { net: 7200 }, card });
    expect(bare.codKg).toBeCloseTo(1.6, 9);
    expect(bare.tdsKg).toBe(0);
  });

  it('refuses a fixation outside nought to one', () => {
    expect(() => batchLoad({ water: { net: 100 }, card, fixation: 1.4 })).toThrow(/fixation/);
  });
});

describe('a whole day', () => {
  const one = batchLoad({ water: { net: 7200 }, card, chemicals });

  it('adds the masses and blends the colour by volume', () => {
    const day = totalDay([one, one]);
    expect(day.volumeM3).toBeCloseTo(14.4, 9);
    expect(day.codKg).toBeCloseTo(one.codKg * 2, 9);
    expect(day.colourUnits).toBeCloseTo(one.colourUnits, 6);
  });

  it('lets a strong small batch pull the day colour up', () => {
    const strong = { volumeM3: 1, codKg: 1, tdsKg: 1, unfixedKg: 1, colourUnits: 1000 };
    const day = totalDay([one, strong]);
    expect(day.colourUnits).toBeGreaterThan(one.colourUnits);
    expect(day.colourUnits).toBeLessThan(1000);
  });

  it('refuses an empty day rather than reporting zeroes', () => {
    expect(() => totalDay([])).toThrow(/at least 1 entries/);
  });
});

describe('against the consent', () => {
  const inside = { volumeM3: 200, codKg: 300, tdsKg: 700, colourUnits: 40 };

  it('passes a day inside every limit', () => {
    expect(checkConsent(consent, inside)).toEqual({ compliant: true, breaches: [] });
  });

  it('names every parameter that breached, not the first', () => {
    const bad = { volumeM3: 400, codKg: 500, tdsKg: 700, colourUnits: 40 };
    const result = checkConsent(consent, bad);
    expect(result.compliant).toBe(false);
    expect(result.breaches.map((b) => b.parameter)).toEqual(['volume', 'cod']);
    expect(result.breaches[0].over).toBeCloseTo(1 / 3, 6);
  });

  it('checks ph only when a reading is given', () => {
    expect(checkConsent(consent, inside, { ph: 10 }).compliant).toBe(false);
    expect(checkConsent(consent, inside, { ph: 7 }).compliant).toBe(true);
    expect(checkConsent(consent, inside).compliant).toBe(true);
  });

  it('reports a ph window rather than a single limit', () => {
    const result = checkConsent(consent, inside, { ph: 4 });
    expect(result.breaches[0].limit).toBe('6 to 9');
  });
});

describe('headroom', () => {
  it('is what is left of each limit', () => {
    const room = headroom(consent, { volumeM3: 150, codKg: 200, tdsKg: 450, colourUnits: 30 });
    expect(room.volume).toBeCloseTo(0.5, 9);
    expect(room.cod).toBeCloseTo(0.5, 9);
  });

  it('goes negative once a limit is past', () => {
    const room = headroom(consent, { volumeM3: 450, codKg: 200, tdsKg: 450, colourUnits: 30 });
    expect(room.volume).toBeCloseTo(-0.5, 9);
  });
});

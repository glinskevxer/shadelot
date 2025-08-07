import { describe, expect, it } from 'vitest';
import {
  EFFECTS,
  SOFTENERS,
  applyFinish,
  describeTradeoff,
  effectsFor,
  judgeFinish,
  prescribeFinish,
} from '../../src/quality/handle.js';

const base = { handle: 2.4, rubWet: 4.2, sewability: 3, slippage: 4, whiteness: 4 };

describe('the softeners', () => {
  it('name the ones the works runs', () => {
    expect(SOFTENERS).toContain('silicone');
    expect(SOFTENERS[0]).toBe('none');
    expect(Object.keys(EFFECTS)).toEqual(SOFTENERS);
  });

  it('all put handle up and rub fastness down, except none', () => {
    for (const softener of SOFTENERS.slice(1)) {
      expect(effectsFor(softener).handle).toBeGreaterThan(0);
      expect(effectsFor(softener).rubWet).toBeLessThan(0);
    }
    expect(effectsFor('none').handle).toBe(0);
  });

  it('refuse one the works does not stock', () => {
    expect(() => effectsFor('wax')).toThrow(/softener/);
  });
});

describe('applying a finish', () => {
  it('puts the handle up and the rub fastness down together', () => {
    const finished = applyFinish(base, 'silicone', 1);
    expect(finished.handle).toBeGreaterThan(base.handle);
    expect(finished.rubWet).toBeLessThan(base.rubWet);
  });

  it('moves further at a bigger dose', () => {
    expect(applyFinish(base, 'silicone', 2).handle).toBeGreaterThan(
      applyFinish(base, 'silicone', 1).handle
    );
  });

  it('never leaves the panel scale', () => {
    const heavy = applyFinish(base, 'macro-silicone', 6);
    for (const value of [heavy.handle, heavy.rubWet, heavy.slippage, heavy.whiteness]) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it('changes nothing with no softener', () => {
    const same = applyFinish(base, 'none', 1);
    expect(same.handle).toBeCloseTo(base.handle, 9);
    expect(same.rubWet).toBeCloseTo(base.rubWet, 9);
  });

  it('takes a base with an axis unstated as the middle of the scale', () => {
    expect(applyFinish({}, 'none', 1).handle).toBe(3);
  });

  it('refuses a dose or a base score off the scale', () => {
    expect(() => applyFinish(base, 'silicone', 9)).toThrow(/owf/);
    expect(() => applyFinish({ ...base, handle: 9 }, 'silicone', 1)).toThrow(/base.handle/);
  });
});

describe('judging a finish', () => {
  it('passes one that meets every floor', () => {
    const finished = applyFinish(base, 'silicone', 1);
    expect(judgeFinish(finished, { handle: 3.5, rubWet: 3 }).verdict).toBe('pass');
  });

  it('fails one that meets the handle by failing the rub fastness', () => {
    const finished = applyFinish(base, 'cationic', 3);
    const result = judgeFinish(finished, { handle: 4, rubWet: 3.5 });
    expect(result.verdict).toBe('fail');
    expect(result.breaches.map((breach) => breach.axis)).toContain('rubWet');
  });

  it('ignores an axis the specification says nothing about', () => {
    const finished = applyFinish(base, 'macro-silicone', 2);
    expect(judgeFinish(finished, { handle: 4 }).verdict).toBe('pass');
  });

  it('reports every axis that failed, not the first', () => {
    const finished = applyFinish(base, 'macro-silicone', 3);
    const result = judgeFinish(finished, { handle: 5, rubWet: 5, slippage: 5 });
    expect(result.breaches.length).toBeGreaterThan(1);
  });

  it('refuses a floor off the panel scale', () => {
    expect(() => judgeFinish(applyFinish(base, 'none', 1), { handle: 9 })).toThrow(
      /specification.handle/
    );
  });
});

describe('prescribing a finish', () => {
  it('takes the least softener that meets the specification', () => {
    const chosen = prescribeFinish(base, { handle: 3.5 });
    expect(chosen.owf).toBeLessThanOrEqual(1.5);
    expect(judgeFinish(chosen.result, { handle: 3.5 }).verdict).toBe('pass');
  });

  it('chooses nothing at all when the cloth already meets it', () => {
    const chosen = prescribeFinish(base, { handle: 2 });
    expect(chosen.softener).toBe('none');
  });

  it('takes the works prices into account when there are any', () => {
    const cheapSilicone = prescribeFinish(
      base,
      { handle: 3.5, rubWet: 3.5 },
      {
        prices: { cationic: 10, silicone: 1, 'macro-silicone': 1, hydrophilic: 10, none: 1 },
      }
    );
    expect(['silicone', 'macro-silicone']).toContain(cheapSilicone.softener);
  });

  it('says so when nothing it runs will do it', () => {
    expect(() => prescribeFinish(base, { handle: 5, rubWet: 5 })).toThrow(
      /cannot be met by any finish/
    );
  });

  it('searches only the doses it was given', () => {
    const chosen = prescribeFinish(base, { handle: 3.5 }, { doses: [2] });
    expect(chosen.owf).toBe(2);
  });
});

describe('the note back to the customer', () => {
  it('names what moved, largest first', () => {
    const finished = applyFinish(base, 'macro-silicone', 1);
    const note = describeTradeoff(base, finished);
    expect(note).toMatch(/handle up/);
    expect(note.split(', ')[0]).toMatch(/handle/);
  });

  it('says nothing moved when nothing did', () => {
    expect(describeTradeoff(base, applyFinish(base, 'none', 1))).toBe('nothing moved');
  });

  it('names the losses as well as the gains', () => {
    const finished = applyFinish(base, 'cationic', 2);
    expect(describeTradeoff(base, finished)).toMatch(/down/);
  });
});

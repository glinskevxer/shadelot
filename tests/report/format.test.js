import { describe, expect, it } from 'vitest';
import {
  NULL_TEXT,
  clip,
  decimals,
  duration,
  money,
  percent,
  signed,
  temperature,
  weight,
} from '../../src/report/format.js';

describe('decimals', () => {
  it('always prints the places asked for', () => {
    expect(decimals(2, 3)).toBe('2.000');
    expect(decimals(2.34567, 2)).toBe('2.35');
    expect(decimals(2, 0)).toBe('2');
  });

  it('prints a dash for nothing rather than a zero', () => {
    expect(decimals(null)).toBe(NULL_TEXT);
    expect(decimals(undefined)).toBe(NULL_TEXT);
  });

  it('refuses a value that is not a number at all', () => {
    expect(() => decimals('2.4')).toThrow(/finite number or nothing/);
    expect(() => decimals(Number.NaN)).toThrow(/finite number/);
  });

  it('refuses a fractional or negative place count', () => {
    expect(() => decimals(2, 1.5)).toThrow(/places/);
    expect(() => decimals(2, -1)).toThrow(/places/);
  });
});

describe('a dispensing weight', () => {
  it('is three places whatever the size', () => {
    expect(weight(0.0004)).toBe('0.000');
    expect(weight(48.3)).toBe('48.300');
    expect(weight(1.2345)).toBe('1.234');
  });
});

describe('percentages and signs', () => {
  it('multiplies a fraction out', () => {
    expect(percent(0.925)).toBe('92.5%');
    expect(percent(0.925, 0)).toBe('93%');
    expect(percent(null)).toBe(NULL_TEXT);
  });

  it('always shows the sign on a difference', () => {
    expect(signed(0.4)).toBe('+0.40');
    expect(signed(-0.4)).toBe('-0.40');
  });

  it('leaves a zero unsigned, since plus nothing reads as an instruction', () => {
    expect(signed(0)).toBe('0.00');
    expect(signed(0.001)).toBe('0.00');
  });
});

describe('money', () => {
  it('carries a symbol', () => {
    expect(money(12.5)).toBe('£12.50');
    expect(money(12.5, { currency: 'EUR' })).toBe('€12.50');
    expect(money(12.5, { currency: 'USD', places: 3 })).toBe('$12.500');
  });

  it('refuses a currency nothing is billed in', () => {
    expect(() => money(1, { currency: 'JPY' })).toThrow(/must be one of GBP, EUR, USD/);
  });
});

describe('durations', () => {
  it('reads as a run sheet reads', () => {
    expect(duration(45)).toBe('45m');
    expect(duration(60)).toBe('1h');
    expect(duration(135)).toBe('2h 15m');
    expect(duration(125)).toBe('2h 05m');
  });

  it('rounds to the nearest minute', () => {
    expect(duration(44.6)).toBe('45m');
  });

  it('refuses a negative run', () => {
    expect(() => duration(-1)).toThrow(/minutes/);
    expect(duration(null)).toBe(NULL_TEXT);
  });
});

describe('temperature', () => {
  it('is whole degrees unless asked otherwise', () => {
    expect(temperature(60.4)).toBe('60C');
    expect(temperature(60.44, 1)).toBe('60.4C');
  });
});

describe('clipping a label', () => {
  it('leaves a short label alone', () => {
    expect(clip('jet 4', 10)).toBe('jet 4');
  });

  it('keeps the start by default', () => {
    expect(clip('combed poplin 40s reactive', 12)).toBe('combed po...');
  });

  it('keeps the end when the end identifies the thing', () => {
    expect(clip('works/2025/batches/B25-00147', 14, { keep: 'end' })).toBe('...s/B25-00147');
  });

  it('takes something that is not a string', () => {
    expect(clip(12345, 10)).toBe('12345');
    expect(clip(null, 10)).toBe('');
  });

  it('refuses a width with no room for the ellipsis', () => {
    expect(() => clip('anything', 3)).toThrow(/room for an ellipsis/);
  });
});

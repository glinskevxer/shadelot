/**
 * The generator itself.
 *
 * A property test is only worth having if the numbers it draws are what it
 * thinks they are. This checks the generator: that it repeats for a seed, that
 * two seeds do not walk together, and that it covers the range it claims to.
 */

import { describe, expect, it } from 'vitest';
import { SEEDS, between, generator, integer, pick } from '../support/random.js';

describe('the generator', () => {
  it('repeats exactly for a seed', () => {
    const a = generator(42);
    const b = generator(42);
    for (let i = 0; i < 200; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it('does not repeat between two seeds', () => {
    const a = generator(42);
    const b = generator(43);
    const first = Array.from({ length: 50 }, () => a());
    const second = Array.from({ length: 50 }, () => b());
    expect(first).not.toEqual(second);
  });

  it('stays inside nought and one', () => {
    const random = generator(7);
    for (let i = 0; i < 5000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('covers the range rather than clustering', () => {
    const random = generator(1997);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 10000; i += 1) {
      bins[Math.floor(random() * 10)] += 1;
    }
    for (const count of bins) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });

  it('does not repeat itself inside a long run', () => {
    const random = generator(20250416);
    const seen = new Set();
    for (let i = 0; i < 20000; i += 1) {
      seen.add(random());
    }
    expect(seen.size).toBeGreaterThan(19000);
  });

  it('refuses a seed nobody could write down again', () => {
    expect(() => generator(1.5)).toThrow(/whole number/);
    expect(() => generator(-1)).toThrow(/whole number/);
    expect(() => generator(Number.NaN)).toThrow(/whole number/);
    expect(() => generator('42')).toThrow(/whole number/);
  });
});

describe('drawing from a range', () => {
  it('stays inside it', () => {
    const random = generator(11);
    for (let i = 0; i < 2000; i += 1) {
      const value = between(random, -5, 12);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(12);
    }
  });

  it('refuses a range that is empty or the wrong way round', () => {
    const random = generator(11);
    expect(() => between(random, 5, 5)).toThrow(/empty or the wrong way round/);
    expect(() => between(random, 12, 5)).toThrow(/wrong way round/);
  });

  it('draws whole numbers inclusive at both ends', () => {
    const random = generator(13);
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      seen.add(integer(random, 1, 4));
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('picking from a list', () => {
  it('only ever returns something from it', () => {
    const random = generator(17);
    const list = ['a', 'b', 'c'];
    for (let i = 0; i < 1000; i += 1) {
      expect(list).toContain(pick(random, list));
    }
  });

  it('reaches every entry over a long enough run', () => {
    const random = generator(19);
    const list = ['a', 'b', 'c', 'd'];
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      seen.add(pick(random, list));
    }
    expect(seen.size).toBe(list.length);
  });

  it('refuses an empty list', () => {
    expect(() => pick(generator(1), [])).toThrow(/empty list/);
    expect(() => pick(generator(1), null)).toThrow(/empty list/);
  });
});

describe('the seeds the property files run', () => {
  it('are whole numbers the generator will take', () => {
    for (const seed of SEEDS) {
      expect(() => generator(seed)).not.toThrow();
    }
  });

  it('are all different', () => {
    expect(new Set(SEEDS).size).toBe(SEEDS.length);
  });
});

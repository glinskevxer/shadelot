import { describe, expect, it } from 'vitest';
import { fromLch, makeLab, toLch } from '../../src/colour/lab.js';
import {
  VERDICTS,
  WORKS_DEFAULT,
  isAcceptable,
  judge,
  makeTolerance,
} from '../../src/colour/tolerance.js';

const standard = makeLab(52.1, -14.3, 22.7);
const lch = toLch(standard);

const block = makeTolerance({
  name: 'Kestrel shirting',
  formula: 'cmc',
  total: 1,
  dL: 0.6,
  dC: 0.8,
  dH: 0.5,
});

describe('building a block', () => {
  it('puts the marginal line at four fifths of the total by default', () => {
    expect(makeTolerance({ name: 'x', formula: 'cmc', total: 1 }).marginalAt).toBeCloseTo(0.8, 9);
  });

  it('refuses a marginal line above the total', () => {
    expect(() => makeTolerance({ name: 'x', formula: 'cmc', total: 1, marginalAt: 1.2 })).toThrow(
      /at or below the total/
    );
  });

  it('leaves an axis unlimited when none is given', () => {
    const loose = makeTolerance({ name: 'x', formula: 'cie76', total: 2 });
    expect(loose.axes).toEqual({ dL: null, dC: null, dH: null });
  });

  it('refuses a formula nothing implements', () => {
    expect(() => makeTolerance({ name: 'x', formula: 'cie2020', total: 1 })).toThrow(/formula/);
  });

  it('carries the formula options through to the judgement', () => {
    const oneToOne = makeTolerance({ name: 'x', formula: 'cmc', total: 5, options: { l: 1 } });
    const lighter = makeLab(standard.L + 1, standard.a, standard.b);
    expect(judge(oneToOne, standard, lighter).value).toBeCloseTo(
      judge(makeTolerance({ name: 'y', formula: 'cmc', total: 5 }), standard, lighter).value * 2,
      6
    );
  });
});

describe('judging a batch', () => {
  it('passes a batch sitting on the standard', () => {
    const result = judge(block, standard, standard);
    expect(result.verdict).toBe('pass');
    expect(result.value).toBeCloseTo(0, 9);
    expect(result.breaches).toEqual([]);
  });

  it('calls a batch marginal between the two lines', () => {
    const nudged = makeLab(standard.L, standard.a + 0.42, standard.b);
    const result = judge(
      makeTolerance({ name: 'x', formula: 'cie76', total: 0.5 }),
      standard,
      nudged
    );
    expect(result.verdict).toBe('marginal');
  });

  it('fails on the total even when every axis is inside its own limit', () => {
    const loose = makeTolerance({ name: 'x', formula: 'cie76', total: 0.5, dL: 9, dC: 9, dH: 9 });
    const result = judge(loose, standard, makeLab(standard.L + 1, standard.a, standard.b));
    expect(result.verdict).toBe('fail');
    expect(result.breaches).toEqual([]);
  });

  it('fails on an axis even when the total is comfortable', () => {
    const hueOff = fromLch({ ...lch, h: lch.h + 2 });
    const wide = makeTolerance({ name: 'x', formula: 'cmc', total: 5, dH: 0.5 });
    const result = judge(wide, standard, hueOff);
    expect(result.verdict).toBe('fail');
    expect(result.breaches.map((b) => b.axis)).toEqual(['dH']);
    expect(result.breaches[0].limit).toBe(0.5);
  });

  it('reports every axis that breached, not the first', () => {
    const off = fromLch({ L: lch.L + 3, C: lch.C + 3, h: lch.h + 4 });
    const result = judge(block, standard, off);
    expect(result.breaches.map((b) => b.axis).sort()).toEqual(['dC', 'dH', 'dL']);
  });

  it('carries the axis differences so the shade card can print them', () => {
    const result = judge(block, standard, makeLab(standard.L + 0.3, standard.a, standard.b));
    expect(result.difference.dL).toBeCloseTo(0.3, 9);
    expect(result.formula).toBe('cmc');
  });
});

describe('a one sided customer', () => {
  const darkOnly = makeTolerance({ name: 'x', formula: 'cmc', total: 2, biasL: 'dark' });

  it('takes a batch on the side it will accept', () => {
    expect(
      judge(darkOnly, standard, makeLab(standard.L - 0.4, standard.a, standard.b)).verdict
    ).toBe('pass');
  });

  it('refuses the other side however small the movement', () => {
    const result = judge(darkOnly, standard, makeLab(standard.L + 0.05, standard.a, standard.b));
    expect(result.verdict).toBe('fail');
    expect(result.breaches[0].note).toMatch(/may not run lighter/);
  });

  it('reads the other way round for a customer who will not take dark', () => {
    const lightOnly = makeTolerance({ name: 'x', formula: 'cmc', total: 2, biasL: 'light' });
    expect(
      judge(lightOnly, standard, makeLab(standard.L - 0.05, standard.a, standard.b)).verdict
    ).toBe('fail');
  });

  it('refuses a bias nothing means', () => {
    expect(() => makeTolerance({ name: 'x', formula: 'cmc', total: 1, biasL: 'either' })).toThrow(
      /biasL/
    );
  });
});

describe('acting on a verdict', () => {
  it('lets a marginal batch through by default and not when it must not', () => {
    const marginal = { verdict: 'marginal' };
    expect(isAcceptable(marginal)).toBe(true);
    expect(isAcceptable(marginal, { allowMarginal: false })).toBe(false);
  });

  it('never lets a fail through', () => {
    expect(isAcceptable({ verdict: 'fail' })).toBe(false);
    expect(VERDICTS).toEqual(['pass', 'marginal', 'fail']);
  });

  it('refuses a verdict nothing produces', () => {
    expect(() => isAcceptable({ verdict: 'probably' })).toThrow(/must be one of pass/);
  });
});

describe('the works default', () => {
  it('is a one unit cmc block with every axis held to seven tenths', () => {
    expect(WORKS_DEFAULT.formula).toBe('cmc');
    expect(WORKS_DEFAULT.total).toBe(1);
    expect(WORKS_DEFAULT.axes).toEqual({ dL: 0.7, dC: 0.7, dH: 0.7 });
  });
});

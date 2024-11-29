/**
 * The corners the ordinary tests walk past.
 *
 * Raising a coverage floor is only worth doing if the lines it forces you to
 * reach are lines somebody would actually hit. These are those lines: the
 * defaults, the fall throughs and the guards that only fire on a bad file.
 */

import { describe, expect, it } from 'vitest';
import { balanceNames, dispensable } from '../src/measure/rounding.js';
import { optional } from '../src/valid/guards.js';
import { isId, randomSuffix } from '../src/model/ids.js';
import { dyeableShare } from '../src/greige/roll.js';
import { nextStates } from '../src/greige/register.js';
import { CLASS_FIBRES } from '../src/dyestuff/catalogue.js';
import { depthBand } from '../src/recipe/depth.js';
import { liquorRatioBand, loadForRatio, makeMachine } from '../src/machine/register.js';
import { hueAngle, makeLab } from '../src/colour/lab.js';
import { deltaE2000 } from '../src/colour/deltae.js';
import { absorptionPeak, flatCurve } from '../src/colour/reflectance.js';
import { clip, duration, signed } from '../src/report/format.js';
import { renderTable } from '../src/report/table.js';

describe('defaults nobody passes', () => {
  it('falls through to the default when a value is absent', () => {
    expect(optional(undefined, Number, 7)).toBe(7);
    expect(optional(0, Number, 7)).toBe(0);
  });

  it('takes the works balance list without an argument', () => {
    expect(balanceNames()).toHaveLength(4);
    expect(dispensable(0).balance).toBe('analytical');
  });

  it('makes a suffix off the real random source', () => {
    expect(randomSuffix()).toHaveLength(4);
    expect(randomSuffix()).toMatch(/^[23456789A-HJ-NP-Z]{4}$/);
  });
});

describe('fall throughs', () => {
  it('answers false rather than throwing for a malformed identifier', () => {
    expect(isId({})).toBe(false);
    expect(isId('')).toBe(false);
  });

  it('reads a fibre share of nothing for a blend that does not carry it', () => {
    expect(dyeableShare({ cotton: 100 }, ['wool'])).toBe(0);
  });

  it('reports an empty onward list for a terminal state', () => {
    expect(nextStates('returned')).toEqual([]);
  });

  it('names a class with a single fibre behind it', () => {
    expect(CLASS_FIBRES.basic).toEqual(['acrylic']);
  });

  it('puts a very heavy shade in the last band without falling off the end', () => {
    expect(depthBand(1000).name).toBe('heavy');
  });
});

describe('the geometry corners', () => {
  it('reads a band on a machine with no dead volume worth mentioning', () => {
    const tight = makeMachine({
      id: 'X',
      type: 'jig',
      minLoadKg: 10,
      maxLoadKg: 100,
      deadVolumeLitres: 1,
      litresPerKg: 2,
    });
    const band = liquorRatioBand(tight);
    expect(band.tightest).toBeLessThan(band.loosest);
    expect(loadForRatio(tight, 2)).toBeNull();
  });

  it('reads a hue angle exactly on the negative axis', () => {
    expect(hueAngle(makeLab(50, -1, -0.0001))).toBeGreaterThan(180);
  });

  it('takes a ciede2000 pair where one sample is neutral', () => {
    expect(deltaE2000(makeLab(50, 0, 0), makeLab(50, 2, 2))).toBeGreaterThan(0);
    expect(deltaE2000(makeLab(50, 2, 2), makeLab(50, 0, 0))).toBeGreaterThan(0);
  });

  it('finds a peak on a curve that only falls', () => {
    expect(absorptionPeak(flatCurve(0.9)).index).toBe(0);
  });
});

describe('the formatting corners', () => {
  it('prints a whole hour with no minutes', () => {
    expect(duration(120)).toBe('2h');
    expect(duration(0.4)).toBe('0m');
  });

  it('prints a negative that rounds to zero without a sign', () => {
    expect(signed(-0.0001)).toBe('0.00');
  });

  it('clips at exactly the width without an ellipsis', () => {
    expect(clip('abcdefgh', 8)).toBe('abcdefgh');
    expect(clip('abcdefghi', 8)).toBe('abcde...');
  });

  it('renders a table whose only row is empty', () => {
    expect(renderTable([{ key: 'a' }], [{}]).split('\n')).toHaveLength(3);
  });
});

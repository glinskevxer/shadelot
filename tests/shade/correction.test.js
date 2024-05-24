import { describe, expect, it } from 'vitest';
import { fromLch, makeLab, toLch } from '../../src/colour/lab.js';
import { flatCurve, makeCurve } from '../../src/colour/reflectance.js';
import {
  ACTIONS,
  DEFAULT_LIMITS,
  addOnDose,
  decide,
  usesMachineTime,
} from '../../src/shade/correction.js';

const standard = makeLab(52.1, -14.3, 22.7);
const lch = toLch(standard);
const curveAt = (r) => makeCurve(new Array(31).fill(r));

describe('the add on dose', () => {
  it('is nothing when the batch is already up to strength', () => {
    expect(addOnDose(1.5, 1)).toBe(0);
    expect(addOnDose(1.5, 1.04)).toBe(0);
  });

  it('divides the shortfall by the exhaustion the second bath will give', () => {
    expect(addOnDose(1.5, 0.9)).toBeCloseTo((1.5 * 0.1) / 0.7, 9);
    expect(addOnDose(1.5, 0.9, { exhaustion: 1 })).toBeCloseTo(0.15, 9);
  });

  it('asks for more dye the weaker the batch is', () => {
    expect(addOnDose(1.5, 0.8)).toBeGreaterThan(addOnDose(1.5, 0.9));
  });

  it('refuses a strength reading nothing could produce', () => {
    expect(() => addOnDose(1.5, 0)).toThrow(/strength/);
    expect(() => addOnDose(1.5, 3)).toThrow(/strength/);
    expect(() => addOnDose(1.5, 0.9, { exhaustion: 0 })).toThrow(/exhaustion/);
  });
});

describe('a batch that passed', () => {
  it('is accepted and says which verdict let it through', () => {
    expect(decide({ standard, batch: standard, verdict: 'pass' })).toEqual({
      action: 'accept',
      reason: 'the batch judged pass',
    });
    expect(decide({ standard, batch: standard, verdict: 'marginal' }).action).toBe('accept');
  });
});

describe('a batch that is off in hue', () => {
  const hueOff = fromLch({ ...lch, h: lch.h + 4 });

  it('goes to strip and redye however weak it also is', () => {
    const result = decide({
      standard,
      batch: hueOff,
      verdict: 'fail',
      standardCurve: curveAt(0.3),
      batchCurve: curveAt(0.45),
    });
    expect(result.action).toBe('strip-and-redye');
    expect(result.reason).toMatch(/adding dye cannot turn a shade/);
  });

  it('is downgraded once it has been round twice already', () => {
    const result = decide({ standard, batch: hueOff, verdict: 'fail', priorCorrections: 2 });
    expect(result.action).toBe('downgrade');
  });

  it('takes a tighter hue limit from the caller', () => {
    const slight = fromLch({ ...lch, h: lch.h + 0.4 });
    expect(decide({ standard, batch: slight, verdict: 'fail', strength: 0.9 }).action).toBe(
      'add-on'
    );
    const tight = decide({
      standard,
      batch: slight,
      verdict: 'fail',
      strength: 0.9,
      limits: { hueLimit: 0.1 },
    });
    expect(tight.action).toBe('strip-and-redye');
  });
});

describe('a batch that is on hue but weak', () => {
  const weak = makeLab(54.5, -14.2, 22.5);

  it('is added on to when it is close', () => {
    const result = decide({ standard, batch: weak, verdict: 'fail', strength: 0.92 });
    expect(result.action).toBe('add-on');
    expect(result.reason).toMatch(/8 percent weak/);
  });

  it('is stripped when an add on would not land level', () => {
    expect(decide({ standard, batch: weak, verdict: 'fail', strength: 0.72 }).action).toBe(
      'strip-and-redye'
    );
  });

  it('is written off when it is nowhere near', () => {
    const result = decide({ standard, batch: weak, verdict: 'fail', strength: 0.4 });
    expect(result.action).toBe('downgrade');
    expect(result.reason).toMatch(/worth the water/);
  });

  it('is downgraded rather than added on a third time', () => {
    const result = decide({
      standard,
      batch: weak,
      verdict: 'fail',
      strength: 0.92,
      priorCorrections: 2,
    });
    expect(result.action).toBe('downgrade');
    expect(result.reason).toMatch(/two add ons/);
  });
});

describe('a batch that came out heavy', () => {
  it('is downgraded, since dye does not come back out', () => {
    const heavy = makeLab(49, -14.4, 22.9);
    const result = decide({ standard, batch: heavy, verdict: 'fail', strength: 1.1 });
    expect(result.action).toBe('downgrade');
    expect(result.reason).toMatch(/cannot be taken back out/);
  });
});

describe('where the strength reading comes from', () => {
  it('is worked off the curves when one is not passed in', () => {
    const result = decide({
      standard,
      batch: makeLab(54, -14.2, 22.6),
      verdict: 'fail',
      standardCurve: curveAt(0.3),
      batchCurve: curveAt(0.312),
    });
    expect(result.action).toBe('add-on');
  });

  it('will not guess when there is neither a reading nor a curve', () => {
    const result = decide({ standard, batch: makeLab(54, -14.2, 22.6), verdict: 'fail' });
    expect(result.action).toBe('strip-and-redye');
    expect(result.reason).toMatch(/no strength reading/);
  });

  it('prefers the reading the lab passed in over the curves', () => {
    const result = decide({
      standard,
      batch: makeLab(54, -14.2, 22.6),
      verdict: 'fail',
      strength: 0.5,
      standardCurve: flatCurve(0.3),
      batchCurve: flatCurve(0.3),
    });
    expect(result.action).toBe('downgrade');
  });
});

describe('what the action costs', () => {
  it('knows which actions put the batch back on a machine', () => {
    expect(usesMachineTime('add-on')).toBe(true);
    expect(usesMachineTime('strip-and-redye')).toBe(true);
    expect(usesMachineTime('accept')).toBe(false);
    expect(usesMachineTime('downgrade')).toBe(false);
  });

  it('refuses an action nothing produces', () => {
    expect(() => usesMachineTime('rewash')).toThrow(/must be one of accept/);
    expect(ACTIONS).toHaveLength(4);
    expect(DEFAULT_LIMITS.stripCount).toBe(2);
  });
});

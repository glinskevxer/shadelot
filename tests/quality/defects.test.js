import { describe, expect, it } from 'vitest';
import {
  CAUSES,
  FAULT_KINDS,
  GRADE_LIMIT,
  OURS,
  gradeRoll,
  makeFault,
  ourShare,
  pointsByCause,
  pointsPerHundred,
} from '../../src/quality/defects.js';
import { pointsFor } from '../../src/quality/defects.js';

const fault = (extra = {}) =>
  makeFault({ rollId: 'R-1188', atMetres: 12, kind: 'crease', lengthCm: 5, ...extra });

describe('the four point system', () => {
  it('gives one point to anything under three inches', () => {
    expect(pointsFor(1)).toBe(1);
    expect(pointsFor(7.6)).toBe(1);
  });

  it('steps up at each published boundary', () => {
    expect(pointsFor(7.7)).toBe(2);
    expect(pointsFor(15.2)).toBe(2);
    expect(pointsFor(15.3)).toBe(3);
    expect(pointsFor(22.9)).toBe(3);
    expect(pointsFor(23)).toBe(4);
  });

  it('never gives more than four however long the fault', () => {
    expect(pointsFor(400)).toBe(4);
  });

  it('refuses a fault of no length', () => {
    expect(() => pointsFor(0)).toThrow(/lengthCm/);
  });
});

describe('recording a fault', () => {
  it('works the points out rather than taking them', () => {
    expect(fault({ lengthCm: 18 }).points).toBe(3);
  });

  it('defaults the cause to unknown', () => {
    expect(fault().cause).toBe('unknown');
    expect(CAUSES).toContain('unknown');
  });

  it('refuses a kind or a cause nothing records', () => {
    expect(() => fault({ kind: 'wrinkle' })).toThrow(/fault.kind/);
    expect(() => fault({ cause: 'weather' })).toThrow(/fault.cause/);
    expect(FAULT_KINDS).toContain('shade-bar');
  });

  it('needs a position, since the cutting room has to find it', () => {
    expect(() => makeFault({ rollId: 'R', kind: 'crease', lengthCm: 5 })).toThrow(/atMetres/);
  });
});

describe('grading a roll', () => {
  const dimensions = { lengthMetres: 100, widthCm: 150 };

  it('reads points per hundred square metres', () => {
    const faults = [fault({ lengthCm: 30 }), fault({ lengthCm: 30 })];
    expect(pointsPerHundred(faults, dimensions)).toBeCloseTo((8 * 100) / 150, 6);
  });

  it('calls a clean roll a first', () => {
    expect(gradeRoll([], dimensions).grade).toBe('first');
    expect(gradeRoll([], dimensions).score).toBe(0);
  });

  it('calls a heavily faulted roll a second', () => {
    const faults = Array.from({ length: 40 }, () => fault({ lengthCm: 30 }));
    expect(gradeRoll(faults, dimensions).grade).toBe('second');
    expect(GRADE_LIMIT).toBe(20);
  });

  it('takes a tighter limit from a fussy customer', () => {
    const faults = Array.from({ length: 6 }, () => fault({ lengthCm: 30 }));
    expect(gradeRoll(faults, dimensions).grade).toBe('first');
    expect(gradeRoll(faults, dimensions, { limit: 10 }).grade).toBe('second');
  });

  it('counts separately what we caused', () => {
    const faults = [
      fault({ cause: 'dyeing' }),
      fault({ cause: 'weaving' }),
      fault({ cause: 'handling' }),
    ];
    const graded = gradeRoll(faults, dimensions);
    expect(graded.faults).toBe(3);
    expect(graded.oursCount).toBe(2);
    expect(graded.oursPoints).toBe(2);
  });

  it('refuses a width nothing is woven at', () => {
    expect(() => pointsPerHundred([], { lengthMetres: 100, widthCm: 900 })).toThrow(/widthCm/);
  });
});

describe('splitting the blame', () => {
  const faults = [
    fault({ cause: 'dyeing', lengthCm: 30 }),
    fault({ cause: 'weaving', lengthCm: 5 }),
    fault({ cause: 'weaving', lengthCm: 5 }),
  ];

  it('totals the points against each cause', () => {
    const totals = pointsByCause(faults);
    expect(totals.dyeing).toBe(4);
    expect(totals.weaving).toBe(2);
    expect(totals.yarn).toBe(0);
  });

  it('reports our share of the points and not of the fault count', () => {
    expect(ourShare(faults)).toBeCloseTo(4 / 6, 9);
    expect(OURS).not.toContain('weaving');
  });

  it('is nothing for a clean roll rather than a division by zero', () => {
    expect(ourShare([])).toBe(0);
  });

  it('refuses a fault carrying a cause the register does not know', () => {
    expect(() => pointsByCause([{ cause: 'sabotage', points: 4 }])).toThrow(
      /not a cause the register/
    );
  });
});

import { describe, expect, it } from 'vitest';
import { makeMachine } from '../../src/machine/register.js';
import {
  DEFAULT_WEIGHTS,
  assign,
  bestMachine,
  scoreLoad,
  splitLot,
} from '../../src/machine/loading.js';

const jet4 = makeMachine({
  id: 'JET-4',
  type: 'jet',
  minLoadKg: 60,
  maxLoadKg: 300,
  deadVolumeLitres: 900,
  litresPerKg: 3.5,
});
const jet5 = makeMachine({
  id: 'JET-5',
  type: 'jet',
  minLoadKg: 40,
  maxLoadKg: 180,
  deadVolumeLitres: 620,
  litresPerKg: 3.2,
});
const jig2 = makeMachine({
  id: 'JIG-2',
  type: 'jig',
  minLoadKg: 30,
  maxLoadKg: 120,
  deadVolumeLitres: 400,
  litresPerKg: 2,
});
const machines = [jet4, jet5, jig2];

describe('scoring a load', () => {
  it('scores nothing for a load that does not fit', () => {
    expect(scoreLoad(jet4, 20, 8).fits).toBe(false);
    expect(scoreLoad(jet4, 20, 8).score).toBe(0);
    expect(scoreLoad(jet4, 500, 8).score).toBe(0);
  });

  it('scores a full load on the ratio it lands at, not only on the fill', () => {
    const full = scoreLoad(jet4, 300, 8);
    const wanted = scoreLoad(jet4, 200, 8);
    expect(full.fill).toBeGreaterThan(wanted.fill);
    expect(wanted.ratioMiss).toBeLessThan(full.ratioMiss);
    expect(wanted.score).toBeGreaterThan(full.score);
  });

  it('takes a works that only cares about filling the machine', () => {
    const weights = { fill: 1, ratio: 0 };
    expect(scoreLoad(jet4, 300, 8, { weights }).score).toBeGreaterThan(
      scoreLoad(jet4, 200, 8, { weights }).score
    );
  });

  it('refuses weightings that do not add to one', () => {
    expect(() => scoreLoad(jet4, 200, 8, { weights: { fill: 0.5, ratio: 0.9 } })).toThrow(
      /weights/
    );
    expect(DEFAULT_WEIGHTS.fill + DEFAULT_WEIGHTS.ratio).toBeCloseTo(1, 9);
  });
});

describe('choosing a machine', () => {
  it('picks the one that lands nearest the wanted ratio', () => {
    expect(bestMachine(machines, 100, 8).machine.id).toBe('JIG-2');
  });

  it('picks a bigger one for a bigger load', () => {
    expect(bestMachine(machines, 250, 8).machine.id).toBe('JET-4');
  });

  it('gives nothing when none of them will take it', () => {
    expect(bestMachine(machines, 5, 8)).toBeNull();
    expect(bestMachine(machines, 900, 8)).toBeNull();
  });

  it('breaks a tie on the machine number so a plan does not shuffle', () => {
    const twin = makeMachine({ ...jet4, id: 'JET-3' });
    expect(bestMachine([jet4, twin], 200, 8).machine.id).toBe('JET-3');
  });
});

describe('assigning a day', () => {
  const lots = [
    { id: 'G1', mass: 250 },
    { id: 'G2', mass: 95 },
    { id: 'G3', mass: 60 },
  ];

  it('puts every lot on its own machine', () => {
    const plan = assign(lots, machines);
    expect(plan.placed).toHaveLength(3);
    expect(new Set(plan.placed.map((row) => row.machineId)).size).toBe(3);
    expect(plan.unplaced).toEqual([]);
  });

  it('places the heaviest lot first, so it is not left with nowhere to go', () => {
    const plan = assign(
      [
        { id: 'small', mass: 70 },
        { id: 'big', mass: 260 },
      ],
      [jet4, jig2]
    );
    expect(plan.placed.find((row) => row.lotId === 'big').machineId).toBe('JET-4');
    expect(plan.unplaced).toEqual([]);
  });

  it('reports what it could not place and why', () => {
    const plan = assign([{ id: 'tiny', mass: 4 }], machines);
    expect(plan.placed).toEqual([]);
    expect(plan.unplaced[0].reason).toMatch(/under every machine minimum/);
  });

  it('says when a lot is too big for anything', () => {
    expect(assign([{ id: 'huge', mass: 900 }], machines).unplaced[0].reason).toMatch(
      /over every machine maximum/
    );
  });

  it('says when the machines were all taken', () => {
    const plan = assign(
      [
        { id: 'G1', mass: 100 },
        { id: 'G2', mass: 100 },
      ],
      [jig2]
    );
    expect(plan.unplaced[0].reason).toMatch(/already committed/);
  });

  it('names the machines it left idle', () => {
    expect(assign([{ id: 'G1', mass: 100 }], machines).idle).toEqual(['JET-4', 'JET-5']);
  });

  it('reports the mean fill and the worst ratio miss', () => {
    const plan = assign(lots, machines);
    expect(plan.meanFill).toBeGreaterThan(0);
    expect(plan.meanFill).toBeLessThanOrEqual(1);
    expect(plan.worstRatioMiss).toBeGreaterThanOrEqual(0);
  });

  it('refuses a day with no lots or no machines', () => {
    expect(() => assign([], machines)).toThrow(/at least 1 entries/);
    expect(() => assign(lots, [])).toThrow(/at least 1 entries/);
  });
});

describe('splitting a lot', () => {
  it('leaves a lot that fits alone', () => {
    expect(splitLot({ id: 'G1', mass: 200 }, jet4)).toEqual([{ id: 'G1', mass: 200 }]);
  });

  it('splits an oversize lot into even loads', () => {
    const pieces = splitLot({ id: 'G1', mass: 700 }, jet4);
    expect(pieces).toHaveLength(3);
    expect(new Set(pieces.map((piece) => piece.mass)).size).toBe(1);
    expect(pieces.reduce((sum, piece) => sum + piece.mass, 0)).toBeCloseTo(700, 9);
  });

  it('numbers the pieces off the lot they came from', () => {
    expect(splitLot({ id: 'G1', mass: 700 }, jet4).map((piece) => piece.id)).toEqual([
      'G1-1',
      'G1-2',
      'G1-3',
    ]);
  });

  it('refuses a split that would put a load under the minimum', () => {
    const narrow = makeMachine({
      id: 'BEAM-1',
      type: 'beam',
      minLoadKg: 100,
      maxLoadKg: 180,
      deadVolumeLitres: 500,
      litresPerKg: 4,
    });
    expect(() => splitLot({ id: 'G1', mass: 185 }, narrow)).toThrow(/under the 100 minimum/);
  });

  it('splits happily on a machine whose band is wide enough', () => {
    expect(splitLot({ id: 'G1', mass: 185 }, jet4)).toHaveLength(1);
    expect(splitLot({ id: 'G1', mass: 320 }, jet4)).toHaveLength(2);
  });

  it('refuses a lot with no cloth in it', () => {
    expect(() => splitLot({ id: 'G1', mass: 0 }, jet4)).toThrow(/lot.mass/);
  });
});

import { describe, expect, it } from 'vitest';
import { makeLab } from '../../src/colour/lab.js';
import {
  correctionFor,
  isExtrapolation,
  makeVector,
  predict,
  solve3,
} from '../../src/recipe/trichromacy.js';

const vectors = [
  makeVector({ code: 'RY-145', dL: -6.2, da: 1.1, db: 12.4, atOwf: 1.2 }),
  makeVector({ code: 'RR-195', dL: -8.4, da: 14.2, db: 2.6, atOwf: 0.3 }),
  makeVector({ code: 'RB-19', dL: -9.1, da: -3.4, db: -11.8, atOwf: 0.7 }),
];

const standard = makeLab(52.14, -14.32, 22.68);

describe('the linear solve', () => {
  it('solves an identity straight back', () => {
    expect(
      solve3(
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [2, 3, 4]
      )
    ).toEqual([2, 3, 4]);
  });

  it('solves a system with a known answer', () => {
    const matrix = [
      [2, 1, -1],
      [-3, -1, 2],
      [-2, 1, 2],
    ];
    const answer = solve3(matrix, [8, -11, -3]);
    expect(answer[0]).toBeCloseTo(2, 9);
    expect(answer[1]).toBeCloseTo(3, 9);
    expect(answer[2]).toBeCloseTo(-1, 9);
  });

  it('refuses a singular system rather than returning infinity', () => {
    expect(() =>
      solve3(
        [
          [1, 2, 3],
          [2, 4, 6],
          [1, 1, 1],
        ],
        [1, 2, 3]
      )
    ).toThrow(/singular, the three dyes do not span/);
  });
});

describe('the correction', () => {
  it('is nothing when the batch is on the standard', () => {
    const corrections = correctionFor(standard, standard, vectors);
    for (const correction of corrections) {
      expect(correction.applied).toBeCloseTo(0, 9);
    }
  });

  it('closes the difference when it is applied', () => {
    const batch = makeLab(54.2, -12.9, 20.6);
    const corrections = correctionFor(standard, batch, vectors, { cap: 5 });
    const predicted = predict(batch, corrections, vectors);
    expect(predicted.L).toBeCloseTo(standard.L, 6);
    expect(predicted.a).toBeCloseTo(standard.a, 6);
    expect(predicted.b).toBeCloseTo(standard.b, 6);
  });

  it('adds dye to a batch that came out light', () => {
    const light = makeLab(56, -14.32, 22.68);
    const corrections = correctionFor(standard, light, vectors, { cap: 5 });
    expect(corrections.reduce((sum, c) => sum + c.applied, 0)).toBeGreaterThan(0);
  });

  it('caps a large move and says it capped it', () => {
    const far = makeLab(70, -2, 40);
    const corrections = correctionFor(standard, far, vectors, { cap: 0.2 });
    expect(corrections.some((correction) => correction.capped)).toBe(true);
    for (const correction of corrections) {
      expect(Math.abs(correction.applied)).toBeLessThanOrEqual(0.2);
    }
  });

  it('keeps the uncapped answer alongside the capped one', () => {
    const far = makeLab(70, -2, 40);
    const capped = correctionFor(standard, far, vectors, { cap: 0.2 }).find((c) => c.capped);
    expect(Math.abs(capped.wanted)).toBeGreaterThan(Math.abs(capped.applied));
  });

  it('names each dye it is talking about', () => {
    const corrections = correctionFor(standard, makeLab(54, -13, 21), vectors);
    expect(corrections.map((c) => c.code)).toEqual(['RY-145', 'RR-195', 'RB-19']);
  });

  it('refuses anything but exactly three dyes', () => {
    expect(() => correctionFor(standard, standard, vectors.slice(0, 2))).toThrow(
      /at least 3 entries/
    );
    expect(() => correctionFor(standard, standard, [...vectors, vectors[0]])).toThrow(
      /exactly three dyes/
    );
  });
});

describe('predicting the result', () => {
  it('agrees with the correction it was worked from', () => {
    const batch = makeLab(53.6, -13.4, 21.9);
    const corrections = correctionFor(standard, batch, vectors, { cap: 5 });
    const predicted = predict(batch, corrections, vectors);
    expect(predicted.L).toBeCloseTo(standard.L, 6);
  });

  it('refuses a correction naming a dye with no vector', () => {
    expect(() => predict(standard, [{ code: 'RX-9', applied: 0.1 }], vectors)).toThrow(
      /no vector against it/
    );
  });

  it('is the batch itself for an empty correction', () => {
    expect(predict(standard, [], vectors)).toEqual({ L: standard.L, a: standard.a, b: standard.b });
  });
});

describe('whether the answer is an extrapolation', () => {
  it('is not for a small move', () => {
    const corrections = correctionFor(standard, makeLab(52.4, -14.2, 22.5), vectors);
    expect(isExtrapolation(corrections, vectors)).toBe(false);
  });

  it('is for a move bigger than the depth the vectors were measured at', () => {
    const corrections = correctionFor(standard, makeLab(70, -2, 40), vectors, { cap: 5 });
    expect(isExtrapolation(corrections, vectors)).toBe(true);
  });

  it('takes a tighter view when the lab wants one', () => {
    const corrections = correctionFor(standard, makeLab(53.2, -13.8, 22.1), vectors, { cap: 5 });
    expect(isExtrapolation(corrections, vectors, { factor: 0.001 })).toBe(true);
  });
});

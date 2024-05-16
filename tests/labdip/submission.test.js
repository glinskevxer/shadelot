import { beforeEach, describe, expect, it } from 'vitest';
import { makeLab } from '../../src/colour/lab.js';
import { makeTolerance } from '../../src/colour/tolerance.js';
import {
  OUTCOMES,
  addDip,
  bestDip,
  closeSubmission,
  makeSubmission,
  passingDips,
  roundsTaken,
} from '../../src/labdip/submission.js';

const standard = makeLab(52.1, -14.3, 22.7);
const tolerance = makeTolerance({ name: 'Kestrel', formula: 'cmc', total: 1 });

const base = {
  id: 'L25-00044',
  customer: 'Kestrel Apparel',
  standardName: 'olive 4488',
  standard,
  substrate: 'cotton poplin',
  tolerance,
};

describe('opening a submission', () => {
  it('starts pending with no dips', () => {
    const submission = makeSubmission(base);
    expect(submission.outcome).toBe('pending');
    expect(submission.dips).toEqual([]);
    expect(roundsTaken(submission)).toBe(0);
  });

  it('refuses a standard that is not a reading', () => {
    expect(() => makeSubmission({ ...base, standard: { L: 'dark' } })).toThrow(
      /must be a lab reading/
    );
    expect(() => makeSubmission({ ...base, standard: null })).toThrow(/submission.standard/);
  });

  it('refuses a tolerance that is not a block', () => {
    expect(() => makeSubmission({ ...base, tolerance: 1 })).toThrow(/must be a tolerance block/);
  });
});

describe('adding dips', () => {
  let submission;
  beforeEach(() => {
    submission = makeSubmission(base);
  });

  it('numbers the rounds as they come', () => {
    addDip(submission, { recipeId: 'R1', reading: makeLab(54, -14, 22) });
    addDip(submission, { recipeId: 'R2', reading: makeLab(53, -14.2, 22.5) });
    expect(submission.dips.map((d) => d.round)).toEqual([1, 2]);
  });

  it('judges each dip as it lands', () => {
    const dip = addDip(submission, { recipeId: 'R1', reading: standard });
    expect(dip.verdict).toBe('pass');
    expect(dip.value).toBeCloseTo(0, 9);
  });

  it('keeps the axis differences on the dip for the lab to read', () => {
    const dip = addDip(submission, { recipeId: 'R1', reading: makeLab(54, -14.3, 22.7) });
    expect(dip.difference.dL).toBeCloseTo(1.9, 6);
  });

  it('takes a note when the technician leaves one', () => {
    const dip = addDip(submission, { recipeId: 'R1', reading: standard, note: 'raised the blue' });
    expect(dip.note).toBe('raised the blue');
  });

  it('refuses a dip with no recipe behind it', () => {
    expect(() => addDip(submission, { reading: standard })).toThrow(/dip.recipeId/);
    expect(() => addDip(submission, { recipeId: 'R1' })).toThrow(/dip.reading/);
  });

  it('takes no more dips once the submission is closed', () => {
    addDip(submission, { recipeId: 'R1', reading: standard });
    closeSubmission(submission, 'approved');
    expect(() => addDip(submission, { recipeId: 'R2', reading: standard })).toThrow(
      /is approved, no further dips/
    );
  });
});

describe('choosing between dips', () => {
  let submission;
  beforeEach(() => {
    submission = makeSubmission(base);
    addDip(submission, { recipeId: 'R1', reading: makeLab(55, -14, 22) });
    addDip(submission, { recipeId: 'R2', reading: makeLab(52.4, -14.3, 22.6) });
    addDip(submission, { recipeId: 'R3', reading: makeLab(53.9, -14.1, 22.2) });
  });

  it('finds the closest whether or not it passed', () => {
    expect(bestDip(submission).recipeId).toBe('R2');
  });

  it('lists the ones that did not fail', () => {
    expect(passingDips(submission).map((d) => d.recipeId)).toEqual(['R2', 'R3']);
    expect(submission.dips.find((d) => d.recipeId === 'R1').verdict).toBe('fail');
  });

  it('will not name a best dip when nothing has been submitted', () => {
    expect(() => bestDip(makeSubmission(base))).toThrow(/at least 1 entries/);
  });
});

describe('closing a submission', () => {
  let submission;
  beforeEach(() => {
    submission = makeSubmission(base);
    addDip(submission, { recipeId: 'R1', reading: makeLab(55, -14, 22) });
    addDip(submission, { recipeId: 'R2', reading: makeLab(52.4, -14.3, 22.6) });
  });

  it('approves the closest dip when none is named', () => {
    closeSubmission(submission, 'approved');
    expect(submission.approvedDip.recipeId).toBe('R2');
    expect(submission.outcome).toBe('approved');
  });

  it('approves the round the customer actually chose, even a worse one', () => {
    closeSubmission(submission, 'approved', { round: 1 });
    expect(submission.approvedDip.recipeId).toBe('R1');
  });

  it('refuses a round that was never submitted', () => {
    expect(() => closeSubmission(submission, 'approved', { round: 7 })).toThrow(/names no dip/);
  });

  it('leaves no approved dip on a rejection', () => {
    closeSubmission(submission, 'rejected');
    expect(submission.approvedDip).toBeNull();
    expect(OUTCOMES).toContain('withdrawn');
  });

  it('will not close twice or reopen', () => {
    closeSubmission(submission, 'rejected');
    expect(() => closeSubmission(submission, 'approved')).toThrow(/already rejected/);
    const fresh = makeSubmission(base);
    expect(() => closeSubmission(fresh, 'pending')).toThrow(/cannot be set back to pending/);
  });
});

import { describe, expect, it } from 'vitest';
import { makeLab } from '../../src/colour/lab.js';
import { makeTolerance } from '../../src/colour/tolerance.js';
import { addDip, closeSubmission, makeSubmission } from '../../src/labdip/submission.js';
import {
  addToLibrary,
  approvalRate,
  averageRounds,
  createDipLibrary,
  repeatStandards,
  search,
} from '../../src/labdip/library.js';

const entry = (submissionId, standard, extra = {}) => ({
  submissionId,
  customer: 'Kestrel Apparel',
  standardName: `standard ${submissionId}`,
  standard,
  substrate: 'cotton poplin',
  recipeId: `R-${submissionId}`,
  rounds: 2,
  approved: true,
  ...extra,
});

const olive = makeLab(52.14, -14.32, 22.68);

const library = createDipLibrary([
  entry('L1', olive),
  entry('L2', makeLab(52.6, -14.1, 22.9)),
  entry('L3', makeLab(38.2, 24.6, -8.4), { rounds: 5, approved: false }),
  entry('L4', makeLab(52.3, -14.2, 22.7), { substrate: 'cotton jersey', customer: 'Marlow' }),
]);

describe('the library', () => {
  it('takes the entries it is given', () => {
    expect(library).toHaveLength(4);
    expect(library[0].recipeId).toBe('R-L1');
  });

  it('defaults an entry to one round and not approved', () => {
    const bare = createDipLibrary([
      { submissionId: 'L9', customer: 'K', standardName: 's', standard: olive, substrate: 'x' },
    ]);
    expect(bare[0].rounds).toBe(1);
    expect(bare[0].approved).toBe(false);
    expect(bare[0].recipeId).toBeNull();
  });

  it('refuses an entry with no customer against it', () => {
    expect(() =>
      createDipLibrary([{ submissionId: 'L9', standardName: 's', standard: olive, substrate: 'x' }])
    ).toThrow(/entry.customer/);
  });
});

describe('adding a finished submission', () => {
  it('carries the approved recipe across', () => {
    const submission = makeSubmission({
      id: 'L25-00044',
      customer: 'Kestrel Apparel',
      standardName: 'olive 4488',
      standard: olive,
      substrate: 'cotton poplin',
      tolerance: makeTolerance({ name: 'x', formula: 'cmc', total: 1 }),
    });
    addDip(submission, { recipeId: 'R-A', reading: makeLab(54, -14, 22) });
    addDip(submission, { recipeId: 'R-B', reading: olive });
    closeSubmission(submission, 'approved');
    const shelf = [];
    const added = addToLibrary(shelf, submission);
    expect(added.recipeId).toBe('R-B');
    expect(added.rounds).toBe(2);
    expect(added.approved).toBe(true);
  });

  it('records a rejected submission with no recipe', () => {
    const submission = makeSubmission({
      id: 'L25-00045',
      customer: 'Kestrel Apparel',
      standardName: 'olive 4489',
      standard: olive,
      substrate: 'cotton poplin',
      tolerance: makeTolerance({ name: 'x', formula: 'cmc', total: 1 }),
    });
    addDip(submission, { recipeId: 'R-A', reading: makeLab(58, -10, 26) });
    closeSubmission(submission, 'rejected');
    const added = addToLibrary([], submission);
    expect(added.approved).toBe(false);
    expect(added.recipeId).toBeNull();
  });
});

describe('searching', () => {
  it('finds the near standards and leaves the far one out', () => {
    const rows = search(library, olive);
    expect(rows.map((row) => row.submissionId)).not.toContain('L3');
    expect(rows.length).toBeGreaterThan(1);
  });

  it('puts the same substrate first', () => {
    const rows = search(library, olive, { substrate: 'cotton jersey' });
    expect(rows[0].submissionId).toBe('L4');
  });

  it('prefers approved work at the same distance', () => {
    const mixed = createDipLibrary([
      entry('A', olive, { approved: false }),
      entry('B', olive, { approved: true }),
    ]);
    expect(search(mixed, olive)[0].submissionId).toBe('B');
  });

  it('drops the unapproved entirely when asked', () => {
    const rows = search(library, makeLab(38.2, 24.6, -8.4), { approvedOnly: true, within: 20 });
    expect(rows.map((row) => row.submissionId)).not.toContain('L3');
  });

  it('honours the distance limit', () => {
    expect(search(library, olive, { within: 0.05 }).map((row) => row.submissionId)).toEqual(['L1']);
  });

  it('returns at most the limit asked for', () => {
    expect(search(library, olive, { limit: 2 })).toHaveLength(2);
  });

  it('refuses a formula nothing implements', () => {
    expect(() => search(library, olive, { formula: 'cie2020' })).toThrow(/formula/);
  });
});

describe('how the lab is doing', () => {
  it('averages the rounds it took', () => {
    expect(averageRounds(library)).toBeCloseTo((2 + 2 + 5 + 2) / 4, 9);
  });

  it('narrows to one customer', () => {
    expect(averageRounds(library, { customer: 'Marlow' })).toBe(2);
    expect(approvalRate(library, { customer: 'Marlow' })).toBe(1);
  });

  it('says nothing rather than zero for a customer with no history', () => {
    expect(averageRounds(library, { customer: 'Nobody' })).toBeNull();
    expect(approvalRate(library, { customer: 'Nobody' })).toBeNull();
  });

  it('reports the approval rate over everything', () => {
    expect(approvalRate(library)).toBeCloseTo(0.75, 9);
  });
});

describe('standards that keep coming back', () => {
  it('groups near identical standards together', () => {
    const repeats = repeatStandards(library, { within: 1 });
    expect(repeats).toHaveLength(1);
    expect(repeats[0].count).toBeGreaterThan(1);
  });

  it('names every customer that asked for the shade', () => {
    const repeats = repeatStandards(library, { within: 1 });
    expect(repeats[0].customers).toContain('Marlow');
    expect(repeats[0].recipeIds.length).toBeGreaterThan(1);
  });

  it('says nothing when every standard is its own', () => {
    const singles = createDipLibrary([entry('A', olive), entry('B', makeLab(20, 40, -30))]);
    expect(repeatStandards(singles, { within: 0.2 })).toEqual([]);
  });
});

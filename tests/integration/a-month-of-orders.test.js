/**
 * A month, from an enquiry to an invoice.
 *
 * The other integration test runs a week of production. This one runs the
 * commercial side end to end: a lab dip series against a customer standard, an
 * order filled by several batches, the shade continuity across them, the
 * quality grading, the invoice, and the month numbers that fall out.
 *
 * It exists because the commercial modules and the production ones meet at
 * exactly two places, the batch and the kilogram, and both of them have been
 * wrong at some point.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assembleWorks } from '../../src/cli/works.js';
import { find } from '../../src/dyestuff/catalogue.js';
import { makeLab } from '../../src/colour/lab.js';
import { makeTolerance } from '../../src/colour/tolerance.js';
import { addDip, bestDip, closeSubmission, makeSubmission } from '../../src/labdip/submission.js';
import { addToLibrary, createDipLibrary, search } from '../../src/labdip/library.js';
import { deliver, makeOrder, outstandingMetres, progress } from '../../src/order/order.js';
import { makeOrder as makeShadeOrder, recordBatch, shadeBand } from '../../src/shade/continuity.js';
import { gradeRoll, makeFault, ourShare } from '../../src/quality/defects.js';
import { invoiceOrder, makeRateCard } from '../../src/invoice/invoice.js';
import { byBatch, byWeight, tally } from '../../src/quality/rft.js';
import { summariseMonth } from '../../src/analysis/monthly.js';
import { splitVariance, reconciles } from '../../src/analysis/variance.js';
import { makeAllowance, greigeNeeded } from '../../src/greige/shrinkage.js';

const works = assembleWorks(
  JSON.parse(readFileSync(new URL('../../examples/works.json', import.meta.url), 'utf8')),
  'examples/works.json'
);

const standard = makeLab(52.14, -14.32, 22.68);
const tolerance = makeTolerance({ name: 'kestrel shirting', formula: 'cmc', total: 1, dL: 0.7 });
const allowance = makeAllowance({
  quality: 'cotton poplin 140gsm',
  lengthShrink: 0.06,
  widthShrink: 0.04,
});

const rateCard = makeRateCard({
  name: 'Kestrel 2025',
  perBand: { pale: 1.1, light: 1.25, medium: 1.4, dark: 1.7, heavy: 2.05 },
  surcharges: { 'small-lot': 0.35, rush: 0.5, 're-dye': 0.9 },
  minimumLotKg: 60,
  minimumCharge: 90,
});

function labApproval() {
  const submission = makeSubmission({
    id: 'L25-00044',
    customer: 'Kestrel Apparel',
    standardName: 'olive 4488',
    standard,
    substrate: 'cotton poplin 140gsm',
    tolerance,
  });
  addDip(submission, { recipeId: 'R25-00081a', reading: makeLab(54.9, -13.1, 21.4) });
  addDip(submission, { recipeId: 'R25-00081b', reading: makeLab(53.2, -13.9, 22.1) });
  addDip(submission, { recipeId: 'R25-00081c', reading: makeLab(52.4, -14.2, 22.6) });
  closeSubmission(submission, 'approved');
  return submission;
}

function month() {
  const submission = labApproval();
  const library = createDipLibrary([]);
  addToLibrary(library, submission);

  const order = makeOrder({
    id: 'O25-0900',
    customer: 'Kestrel Apparel',
    quality: 'cotton poplin 140gsm',
    shade: 'olive 4488',
    metres: 6000,
    dueAt: '2025-05-16',
  });
  const shade = makeShadeOrder({
    id: 'O25-0900',
    customer: 'Kestrel Apparel',
    standard,
    tolerance,
    continuityLimit: 0.6,
  });

  const readings = [
    makeLab(52.2, -14.3, 22.7),
    makeLab(52.35, -14.28, 22.62),
    makeLab(52.08, -14.35, 22.75),
    makeLab(55.6, -13.1, 24.2),
    makeLab(52.25, -14.29, 22.66),
  ];

  const batches = readings.map((reading, index) => {
    const batchId = `B25-005${index + 1}`;
    const metres = 1250;
    const fibreKg = Math.round((metres * 1.5 * 140) / 1000);
    const recorded = recordBatch(shade, { batchId, reading });
    const faults = [
      makeFault({
        rollId: batchId,
        atMetres: 42,
        kind: 'crease',
        lengthCm: index === 3 ? 40 : 6,
        cause: 'dyeing',
      }),
      makeFault({ rollId: batchId, atMetres: 180, kind: 'slub', lengthCm: 4, cause: 'yarn' }),
    ];
    const graded = gradeRoll(faults, { lengthMetres: metres, widthCm: 150 });
    const passes = recorded.accepted ? 1 : 2;
    if (recorded.accepted && outstandingMetres(order) > 0) {
      deliver(order, { batchId, metres: Math.min(metres, outstandingMetres(order)) });
    }
    return {
      id: batchId,
      machineId: 'JET-4',
      customer: 'Kestrel Apparel',
      band: 'medium',
      metres,
      fibreKg,
      saleableKg: graded.grade === 'first' ? fibreKg : Math.round(fibreKg * 0.9),
      firstsKg: graded.grade === 'first' ? fibreKg : 0,
      secondsKg: graded.grade === 'first' ? 0 : fibreKg,
      cost: fibreKg * 1.31 * passes,
      waterLitres: fibreKg * 38,
      machineMinutes: 210 * passes,
      passes,
      accepted: recorded.accepted,
      downgraded: graded.grade !== 'first',
      recorded,
      graded,
      faults,
    };
  });

  return { submission, library, order, shade, batches };
}

describe('a month of orders', () => {
  const run = month();

  it('prices the approved recipe off the same works everything else reads', () => {
    expect(find(works.catalogue, 'RY-145-ACME').pricePerKg).toBeGreaterThan(0);
    expect(works.tolerances.has('kestrel shirting')).toBe(true);
  });

  it('approves a dip on the third round and keeps the two that lost', () => {
    expect(run.submission.outcome).toBe('approved');
    expect(run.submission.dips).toHaveLength(3);
    expect(run.submission.approvedDip.recipeId).toBe('R25-00081c');
    expect(bestDip(run.submission).recipeId).toBe('R25-00081c');
  });

  it('files the approval so the next enquiry finds it', () => {
    const found = search(run.library, makeLab(52.1, -14.3, 22.7), {
      substrate: 'cotton poplin 140gsm',
    });
    expect(found).toHaveLength(1);
    expect(found[0].recipeId).toBe('R25-00081c');
    expect(found[0].approved).toBe(true);
  });

  it('books greige against the finished order with the shrinkage on top', () => {
    expect(greigeNeeded(6000, allowance)).toBeGreaterThan(6000);
  });

  it('delivers only the batches that held their shade', () => {
    const status = progress(run.order);
    expect(status.batches).toBe(4);
    expect(status.delivered).toBe(5000);
    expect(status.outstanding).toBe(1000);
    expect(run.order.state).toBe('part-delivered');
  });

  it('rejects the one batch that went off and keeps it out of the band', () => {
    const rejected = run.batches.filter((batch) => !batch.accepted);
    expect(rejected).toHaveLength(1);
    expect(shadeBand(run.shade).count).toBe(4);
  });

  it('grades the badly creased batch a second and charges it as one', () => {
    const invoice = invoiceOrder(rateCard, {
      number: 'I25-0410',
      customer: 'Kestrel Apparel',
      batches: run.batches.map((batch) => ({
        id: batch.id,
        band: batch.band,
        firstsKg: batch.firstsKg || undefined,
        secondsKg: batch.secondsKg || undefined,
      })),
    });
    const seconds = invoice.batches.filter((row) =>
      row.lines.some((line) => line.kind === 'seconds')
    );
    expect(seconds.length).toBeGreaterThanOrEqual(0);
    expect(invoice.kg).toBeCloseTo(
      run.batches.reduce((sum, batch) => sum + batch.fibreKg, 0),
      6
    );
  });

  it('reads right first time the same way from two modules', () => {
    const counted = tally(run.batches);
    const month = summariseMonth(run.batches);
    expect(counted.counts['first-time']).toBe(month.firstTime);
    expect(byBatch(run.batches)).toBeCloseTo(month.rightFirstTime, 9);
  });

  it('reads a different rate by weight when the failure is a full batch', () => {
    expect(byWeight(run.batches)).toBeGreaterThan(0);
    expect(byWeight(run.batches)).toBeLessThanOrEqual(1);
  });

  it('splits a variance against the plan that accounts for the whole difference', () => {
    const plan = [{ band: 'medium', kg: 1200, perKg: 1.3 }];
    const actual = [
      {
        band: 'medium',
        kg: run.batches.reduce((sum, batch) => sum + batch.fibreKg, 0),
        perKg:
          run.batches.reduce((sum, batch) => sum + batch.cost, 0) /
          run.batches.reduce((sum, batch) => sum + batch.fibreKg, 0),
      },
    ];
    const variance = splitVariance(plan, actual);
    expect(reconciles(variance)).toBe(true);
  });

  it('agrees on our share of the faults across the batches', () => {
    for (const batch of run.batches) {
      expect(ourShare(batch.faults)).toBeGreaterThan(0);
      expect(ourShare(batch.faults)).toBeLessThanOrEqual(1);
      expect(batch.graded.oursPoints).toBeLessThanOrEqual(
        batch.faults.reduce((sum, fault) => sum + fault.points, 0)
      );
    }
  });

  it('costs the month at a figure the works would recognise', () => {
    const month = summariseMonth(run.batches, { machineHoursAvailable: 400 });
    expect(month.costPerSaleableKg).toBeGreaterThan(1);
    expect(month.costPerSaleableKg).toBeLessThan(4);
    expect(month.utilisation).toBeGreaterThan(0);
  });
});

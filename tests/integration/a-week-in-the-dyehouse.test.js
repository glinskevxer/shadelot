/**
 * A week end to end.
 *
 * Every other test file checks one module against itself. This one runs a whole
 * week through the modules in the order the floor runs them, and it exists to
 * catch the failures that only show up where two modules meet: a number that
 * agrees with itself on both sides of a join and disagrees across it.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assembleWorks } from '../../src/cli/works.js';
import { makeRoll } from '../../src/greige/roll.js';
import { groupIntoLots, makeLot } from '../../src/greige/lot.js';
import {
  allocate,
  createRegister,
  massInState,
  moveTo,
  receive,
} from '../../src/greige/register.js';
import { makeRecipe } from '../../src/recipe/recipe.js';
import { findMachine } from '../../src/machine/register.js';
import { planBatch } from '../../src/batch/plan.js';
import { makeLab } from '../../src/colour/lab.js';
import { makeTolerance } from '../../src/colour/tolerance.js';
import { judge } from '../../src/colour/tolerance.js';
import { decide } from '../../src/shade/correction.js';
import { makeOrder, recordBatch, rightFirstTime, shadeBand } from '../../src/shade/continuity.js';
import { batchWater, makeRinse, specificWater } from '../../src/utility/water.js';
import { batchEnergy } from '../../src/utility/energy.js';
import { makeProfile } from '../../src/process/curve.js';
import { costBatch, makeTariff } from '../../src/cost/batch.js';
import { batchLoad, checkConsent, makeConsent, totalDay } from '../../src/effluent/load.js';
import { createStock, issue, onHand, receiveLot } from '../../src/inventory/stock.js';
import { createTrail, forSubject, verify } from '../../src/audit/trail.js';
import { summariseMonth } from '../../src/analysis/monthly.js';

const worksDocument = JSON.parse(
  readFileSync(new URL('../../examples/works.json', import.meta.url), 'utf8')
);
const recipeDocument = JSON.parse(
  readFileSync(new URL('../../examples/recipe-olive.json', import.meta.url), 'utf8')
);
const profileDocument = JSON.parse(
  readFileSync(new URL('../../examples/profile-reactive-60.json', import.meta.url), 'utf8')
);
const stockDocument = JSON.parse(
  readFileSync(new URL('../../examples/stock.json', import.meta.url), 'utf8')
);

const works = assembleWorks(worksDocument, 'examples/works.json');
const recipe = makeRecipe(recipeDocument, works);
const profile = makeProfile(profileDocument);
const standard = makeLab(52.14, -14.32, 22.68);
const tolerance = makeTolerance({ name: 'kestrel shirting', formula: 'cmc', total: 1 });

const rollTemplate = {
  quality: 'cotton poplin 140gsm',
  construction: 'woven',
  blend: { cotton: 100 },
  widthCm: 150,
  gsm: 140,
};

function week() {
  const trail = createTrail({ clock: () => '2025-05-05T06:00:00Z' });
  const register = createRegister();
  const stock = createStock();
  for (const lot of stockDocument) {
    receiveLot(stock, lot);
  }

  const rolls = Array.from({ length: 12 }, (_, i) =>
    makeRoll({ ...rollTemplate, id: `R-${1200 + i}`, length: 320 + (i % 3) * 40 })
  );
  for (const roll of rolls) {
    receive(register, roll, { at: '2025-05-05' });
  }

  const groups = groupIntoLots(rolls);
  const lots = groups[0].rolls
    .reduce((chunks, roll, index) => {
      const chunk = Math.floor(index / 3);
      chunks[chunk] = [...(chunks[chunk] ?? []), roll];
      return chunks;
    }, [])
    .map((members, index) =>
      makeLot({ id: `G25-0${index + 1}`, customer: 'Kestrel Apparel', rolls: members })
    );

  const machine = findMachine(works.machines, 'JET-4');
  const tariff = makeTariff(works.tariff);
  const consent = makeConsent(works.consent);
  const order = makeOrder({
    id: 'O25-0900',
    customer: 'Kestrel Apparel',
    standard,
    tolerance,
    continuityLimit: 0.6,
  });

  const readings = [
    makeLab(52.2, -14.3, 22.7),
    makeLab(52.35, -14.28, 22.62),
    makeLab(52.1, -14.35, 22.75),
    makeLab(55.4, -13.2, 24.1),
  ];

  const results = lots.map((lot, index) => {
    allocate(
      register,
      lot.rolls.map((roll) => roll.id),
      lot.id
    );
    for (const roll of lot.rolls) {
      moveTo(register, roll.id, 'in-process');
    }

    const batch = planBatch(
      { id: `B25-004${index + 1}`, machine, recipe, lots: [lot] },
      {
        catalogue: works.catalogue,
        chemicals: works.chemicals,
        saltCode: works.saltCode,
        alkaliCode: works.alkaliCode,
        trail,
      }
    );

    for (const line of batch.card.lines) {
      if (onHand(stock, line.code) >= line.kg) {
        issue(stock, line.code, line.kg, { batchId: batch.id });
      }
    }

    const water = batchWater({
      bathLitres: batch.litres,
      rinses: [makeRinse({ kind: 'drop-and-fill', baths: 3 })],
      soapBaths: 1,
    });
    const energy = batchEnergy(profile, { litres: batch.litres, machine });
    const reading = readings[index] ?? readings[0];
    const verdict = judge(tolerance, standard, reading);
    const outcome = decide({ standard, batch: reading, verdict: verdict.verdict, strength: 0.94 });
    const recorded = recordBatch(order, { batchId: batch.id, reading });
    const effluent = batchLoad({ water, card: batch.card, chemicals: works.chemicals });

    for (const roll of lot.rolls) {
      moveTo(register, roll.id, 'dyed');
    }

    const costing = costBatch({
      tariff,
      passes: [{ card: batch.card, water, energy }],
      fibreKg: batch.fibreKg,
      saleableKg: recorded.accepted ? batch.fibreKg : batch.fibreKg * 0.9,
    });

    return { batch, water, energy, verdict, outcome, recorded, effluent, costing };
  });

  return { trail, register, stock, order, lots, results, consent };
}

describe('a week in the dyehouse', () => {
  const run = week();

  it('forms one lot family out of the delivery and dyes all of it', () => {
    expect(run.lots).toHaveLength(4);
    expect(run.results).toHaveLength(4);
    expect(massInState(run.register, 'dyed')).toBeCloseTo(
      run.lots.reduce((sum, lot) => sum + lot.mass, 0),
      6
    );
  });

  it('agrees on the load between the lot, the batch and the card', () => {
    for (const { batch } of run.results) {
      const lot = run.lots.find((candidate) => candidate.id === batch.lotIds[0]);
      expect(batch.fibreKg).toBeCloseTo(lot.mass, 9);
      expect(batch.card.fibreKg).toBeCloseTo(lot.mass, 9);
    }
  });

  it('agrees on the bath volume between the machine, the batch and the water account', () => {
    for (const { batch, water } of run.results) {
      expect(water.dye).toBeCloseTo(batch.litres, 9);
      expect(water.net).toBeGreaterThan(batch.litres);
    }
  });

  it('carries the dye off the card into the effluent load', () => {
    for (const { batch, effluent } of run.results) {
      const dyeKg = batch.card.lines
        .filter((line) => line.kind === 'dye')
        .reduce((sum, line) => sum + line.kg, 0);
      expect(effluent.unfixedKg).toBeCloseTo(dyeKg * 0.25, 6);
    }
  });

  it('draws every dispensed line it could out of stock', () => {
    const issues = run.stock.movements.filter((movement) => movement.kind === 'issue');
    expect(issues.length).toBeGreaterThan(10);
    for (const lot of run.stock.lots) {
      expect(lot.remainingKg).toBeGreaterThanOrEqual(0);
      expect(lot.remainingKg).toBeLessThanOrEqual(lot.quantityKg);
    }
  });

  it('accepts the three batches on shade and rejects the fourth', () => {
    const accepted = run.results.filter((result) => result.recorded.accepted);
    expect(accepted).toHaveLength(3);
    expect(rightFirstTime(run.order)).toBeCloseTo(0.75, 9);
  });

  it('keeps the accepted batches inside a shade band tighter than the tolerance', () => {
    const band = shadeBand(run.order);
    expect(band.count).toBe(3);
    expect(band.widest).toBeLessThan(run.order.tolerance.total);
  });

  it('sends the failed batch somewhere other than accept', () => {
    const failed = run.results.find((result) => !result.recorded.accepted);
    expect(failed.verdict.verdict).toBe('fail');
    expect(['add-on', 'strip-and-redye', 'downgrade']).toContain(failed.outcome.action);
  });

  it('stays inside the discharge consent for the week', () => {
    const day = totalDay(run.results.map((result) => result.effluent));
    expect(checkConsent(run.consent, day).compliant).toBe(true);
  });

  it('leaves a trail for every batch and it verifies', () => {
    expect(verify(run.trail).intact).toBe(true);
    for (const { batch } of run.results) {
      expect(forSubject(run.trail, batch.id).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('costs the week and the per kilogram figure is believable', () => {
    const month = summariseMonth(
      run.results.map((result) => ({
        id: result.batch.id,
        fibreKg: result.batch.fibreKg,
        saleableKg: result.recorded.accepted ? result.batch.fibreKg : result.batch.fibreKg * 0.9,
        cost: result.costing.total,
        waterLitres: result.water.net,
        machineMinutes: result.energy.minutes,
        passes: 1,
        accepted: result.recorded.accepted,
      })),
      { machineHoursAvailable: 120 }
    );
    expect(month.costPerSaleableKg).toBeGreaterThan(0.5);
    expect(month.costPerSaleableKg).toBeLessThan(20);
    expect(month.rightFirstTime).toBeCloseTo(0.75, 9);
  });

  it('reports a water figure per kilogram in the range the trade quotes', () => {
    for (const { water, batch } of run.results) {
      const specific = specificWater(water, batch.fibreKg);
      expect(specific).toBeGreaterThan(20);
      expect(specific).toBeLessThan(200);
    }
  });
});

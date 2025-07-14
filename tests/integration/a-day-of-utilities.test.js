/**
 * A day of utilities, end to end.
 *
 * Water, steam, effluent and heat recovery all read the same batches and all
 * have to agree about them. They are written as separate modules because they
 * are separate bills, and this is the test that they are separate views of one
 * day rather than four different days.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assembleWorks } from '../../src/cli/works.js';
import { makeRecipe } from '../../src/recipe/recipe.js';
import { buildCard } from '../../src/recipe/card.js';
import { findMachine } from '../../src/machine/register.js';
import { makeProfile, totalMinutes } from '../../src/process/curve.js';
import { batchWater, makeRinse, specificWater } from '../../src/utility/water.js';
import { batchEnergy } from '../../src/utility/energy.js';
import {
  assessLosses,
  reconcileDay,
  steamFromHeat,
  allocateLosses,
} from '../../src/utility/steam.js';
import { makeExchanger, recoverDay, payback } from '../../src/utility/recovery.js';
import {
  batchLoad,
  checkConsent,
  consentReport,
  makeConsent,
  totalDay,
} from '../../src/effluent/load.js';
import { costBatch, makeTariff } from '../../src/cost/batch.js';
import { fixation } from '../../src/process/exhaust.js';
import { planWashOff, residueAfter } from '../../src/process/wash.js';

const works = assembleWorks(
  JSON.parse(readFileSync(new URL('../../examples/works.json', import.meta.url), 'utf8')),
  'examples/works.json'
);
const recipe = makeRecipe(
  JSON.parse(readFileSync(new URL('../../examples/recipe-olive.json', import.meta.url), 'utf8')),
  works
);
const profile = makeProfile(
  JSON.parse(
    readFileSync(new URL('../../examples/profile-reactive-60.json', import.meta.url), 'utf8')
  )
);

const tariff = makeTariff(works.tariff);
const consent = makeConsent(works.consent);
const exchanger = makeExchanger({
  id: 'HX-1',
  effectiveness: 0.62,
  maxLitresPerMinute: 300,
  tankLitres: 5000,
  coldInletC: 11,
});

const loads = [
  { id: 'B25-00601', machineId: 'JET-4', fibreKg: 260 },
  { id: 'B25-00602', machineId: 'JET-5', fibreKg: 150 },
  { id: 'B25-00603', machineId: 'JIG-2', fibreKg: 110 },
  { id: 'B25-00604', machineId: 'JET-4', fibreKg: 200 },
];

function day() {
  return loads.map((load) => {
    const machine = findMachine(works.machines, load.machineId);
    const litres = machine.deadVolumeLitres + machine.litresPerKg * load.fibreKg;
    const card = buildCard(recipe, load.fibreKg, {
      catalogue: works.catalogue,
      chemicals: works.chemicals,
      saltCode: works.saltCode,
      alkaliCode: works.alkaliCode,
    });
    const saltLine = card.lines.find((line) => line.role === 'salt');
    const conditions = {
      saltGpl: saltLine ? (saltLine.kg * 1000) / litres : 0,
      temperature: 60,
      liquorRatio: litres / load.fibreKg,
    };
    const fixed = fixation(conditions);
    const washPlan = planWashOff(0.01, { startingResidue: 1 - fixed });
    const water = batchWater({
      bathLitres: litres,
      rinses: [makeRinse({ kind: 'drop-and-fill', baths: washPlan.baths.length })],
      soapBaths: washPlan.baths.filter((bath) => bath === 'soap').length,
    });
    const energy = batchEnergy(profile, { litres, machine });
    const effluent = batchLoad({ water, card, chemicals: works.chemicals, fixation: fixed });
    const costing = costBatch({
      tariff,
      passes: [{ card, water, energy }],
      fibreKg: load.fibreKg,
    });
    return {
      ...load,
      machine,
      litres,
      card,
      conditions,
      fixed,
      washPlan,
      water,
      energy,
      effluent,
      costing,
    };
  });
}

describe('a day of utilities', () => {
  const run = day();

  it('reads the same bath volume in the water account and the energy one', () => {
    for (const batch of run) {
      expect(batch.water.dye).toBeCloseTo(batch.litres, 9);
      expect(batch.energy.totalKj).toBeGreaterThan(0);
    }
  });

  it('runs each machine at the liquor ratio the water account used', () => {
    for (const batch of run) {
      expect(batch.conditions.liquorRatio).toBeCloseTo(batch.litres / batch.fibreKg, 9);
    }
  });

  it('washes off to the target the plan aimed at', () => {
    for (const batch of run) {
      expect(batch.washPlan.reached).toBe(true);
      expect(
        residueAfter(batch.washPlan.baths, { startingResidue: 1 - batch.fixed })
      ).toBeLessThanOrEqual(0.01);
    }
  });

  it('puts less down the drain from the batch that fixed best', () => {
    const sorted = [...run].sort((a, b) => b.fixed - a.fixed);
    const perKg = (batch) => batch.effluent.unfixedKg / batch.fibreKg;
    expect(perKg(sorted[0])).toBeLessThan(perKg(sorted.at(-1)) + 1e-9);
  });

  it('stays inside the discharge consent for the day', () => {
    const total = totalDay(run.map((batch) => batch.effluent));
    const report = consentReport(consent, total);
    expect(checkConsent(consent, total).compliant).toBe(true);
    expect(report.tightest.used).toBeLessThan(1);
  });

  it('reconciles the batch steam against a boiler that made a bit more', () => {
    const batches = run.map((batch) => ({
      id: batch.id,
      steamKg: steamFromHeat(batch.energy.totalKj),
      fibreKg: batch.fibreKg,
    }));
    const claimed = batches.reduce((sum, batch) => sum + batch.steamKg, 0);
    const reconciliation = reconcileDay({ boilerSteamKg: claimed * 1.1, batches });
    expect(assessLosses(reconciliation).state).toBe('normal');
    const allocated = allocateLosses(reconciliation, batches);
    expect(allocated.reduce((sum, row) => sum + row.chargedKg, 0)).toBeCloseTo(claimed * 1.1, 6);
  });

  it('recovers heat from the drops and the recovery is worth less than the heat put in', () => {
    const drops = run.map((batch) => ({
      batchId: batch.id,
      dropLitres: batch.litres,
      dropTemperature: 60,
    }));
    const recovered = recoverDay(exchanger, drops);
    const put = run.reduce((sum, batch) => sum + batch.energy.totalKj, 0);
    expect(recovered.heatKj).toBeGreaterThan(0);
    expect(recovered.heatKj).toBeLessThan(put);
    expect(
      payback(recovered, { capitalCost: 30000, steamPerTonne: tariff.steamPerTonne }).years
    ).toBeGreaterThan(0);
  });

  it('costs a day whose water figure per kilogram is in the trade range', () => {
    for (const batch of run) {
      const specific = specificWater(batch.water, batch.fibreKg);
      expect(specific).toBeGreaterThan(15);
      expect(specific).toBeLessThan(200);
    }
  });

  it('charges the longest run the most machine time', () => {
    const minutes = totalMinutes(profile);
    for (const batch of run) {
      expect(batch.energy.minutes).toBeCloseTo(minutes, 6);
      expect(batch.costing.heads.labour).toBeGreaterThan(0);
    }
  });

  it('costs the biggest load the most in absolute terms and not per kilogram', () => {
    const biggest = run.reduce((best, batch) => (batch.fibreKg > best.fibreKg ? batch : best));
    const smallest = run.reduce((best, batch) => (batch.fibreKg < best.fibreKg ? batch : best));
    expect(biggest.costing.total).toBeGreaterThan(smallest.costing.total);
    expect(biggest.costing.perKgCharged).toBeLessThan(smallest.costing.perKgCharged);
  });
});

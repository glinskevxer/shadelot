import { describe, expect, it } from 'vitest';
import { createCatalogue, makeDyestuff } from '../../src/dyestuff/catalogue.js';
import { createChemicalStore, makeChemical } from '../../src/chemical/catalogue.js';
import { makeRecipe } from '../../src/recipe/recipe.js';
import { makeMachine } from '../../src/machine/register.js';
import { createTrail, forSubject, verify } from '../../src/audit/trail.js';
import {
  FIT_REASONS,
  assessFit,
  fillFactor,
  planBatch,
  ratioDrift,
  redoseForRatio,
} from '../../src/batch/plan.js';

const catalogue = createCatalogue([
  makeDyestuff({
    code: 'RB-19',
    name: 'Blue',
    supplier: 'Acme',
    dyeClass: 'reactive',
    pricePerKg: 24,
  }),
]);

const chemicals = createChemicalStore([
  makeChemical({ code: 'NACL', name: 'Salt', role: 'salt', basis: 'gpl', pricePerKg: 0.12 }),
  makeChemical({
    code: 'SEQ-2',
    name: 'Sequestrant',
    role: 'sequestrant',
    basis: 'gpl',
    pricePerKg: 4,
  }),
  makeChemical({ code: 'WET-4', name: 'Wetter', role: 'wetting', basis: 'owf', pricePerKg: 3 }),
]);

const recipe = makeRecipe(
  {
    id: 'R25-00090',
    name: 'Kestrel navy',
    process: 'exhaust',
    substrate: 'cotton woven',
    liquorRatio: 8,
    dyes: [{ code: 'RB-19', owf: 1.5 }],
    auxiliaries: [
      { code: 'SEQ-2', dose: 0.5 },
      { code: 'WET-4', dose: 1 },
    ],
  },
  { catalogue, chemicals }
);

const jet = makeMachine({
  id: 'JET-4',
  type: 'jet',
  minLoadKg: 60,
  maxLoadKg: 300,
  deadVolumeLitres: 900,
  litresPerKg: 3.5,
});

const context = { catalogue, chemicals, saltCode: 'NACL' };
const lot = (id, mass) => ({ id, mass });

describe('whether a load fits', () => {
  it('names the reason it does not', () => {
    expect(assessFit(jet, recipe, 40)).toEqual({ fits: false, reason: 'below-minimum' });
    expect(assessFit(jet, recipe, 400)).toEqual({ fits: false, reason: 'above-maximum' });
    expect(assessFit(jet, recipe, 200)).toEqual({ fits: true, reason: 'ok' });
    expect(FIT_REASONS).toContain('wrong-process');
  });

  it('refuses a machine that cannot run the process whatever the load is', () => {
    const jig = makeMachine({ ...jet, id: 'JIG-1', type: 'pad-mangle' });
    expect(assessFit(jig, recipe, 200).reason).toBe('wrong-process');
  });

  it('takes both ends of the load band', () => {
    expect(assessFit(jet, recipe, 60).fits).toBe(true);
    expect(assessFit(jet, recipe, 300).fits).toBe(true);
  });
});

describe('re-dosing for the ratio the machine really runs', () => {
  it('leaves a percent on weight line alone and scales a grams per litre one', () => {
    const redosed = redoseForRatio(recipe, 16);
    expect(redosed.auxiliaries.find((a) => a.code === 'WET-4').dose).toBe(1);
    expect(redosed.auxiliaries.find((a) => a.code === 'SEQ-2').dose).toBeCloseTo(0.25, 9);
  });

  it('puts the same mass of chemical in a longer bath', () => {
    const redosed = redoseForRatio(recipe, 16);
    const before = (0.5 * 8 * 100) / 1000;
    const after = (redosed.auxiliaries.find((a) => a.code === 'SEQ-2').dose * 16 * 100) / 1000;
    expect(after).toBeCloseTo(before, 9);
  });

  it('is the identity at the ratio it was written for', () => {
    const redosed = redoseForRatio(recipe, 8);
    expect(redosed.auxiliaries.map((a) => a.dose)).toEqual(recipe.auxiliaries.map((a) => a.dose));
  });

  it('reports the drift with a sign', () => {
    expect(ratioDrift(jet, recipe, 200)).toBeCloseTo(0, 9);
    expect(ratioDrift(jet, recipe, 100)).toBeGreaterThan(0);
    expect(ratioDrift(jet, recipe, 300)).toBeLessThan(0);
  });
});

describe('planning a batch', () => {
  it('adds the lots up and runs the card on the total', () => {
    const batch = planBatch(
      { id: 'B25-00301', machine: jet, recipe, lots: [lot('G1', 120), lot('G2', 80)] },
      context
    );
    expect(batch.fibreKg).toBe(200);
    expect(batch.actualRatio).toBeCloseTo(8, 9);
    expect(batch.redosed).toBe(false);
    expect(batch.card.fibreKg).toBe(200);
  });

  it('re-doses once the drift passes the tolerance', () => {
    const batch = planBatch(
      { id: 'B25-00302', machine: jet, recipe, lots: [lot('G1', 100)] },
      context
    );
    expect(batch.redosed).toBe(true);
    const seq = batch.card.lines.find((l) => l.code === 'SEQ-2');
    expect(seq.dose).toBeLessThan(0.5);
  });

  it('leaves a small drift alone', () => {
    const batch = planBatch(
      { id: 'B25-00303', machine: jet, recipe, lots: [lot('G1', 195)] },
      context
    );
    expect(Math.abs(batch.ratioDrift)).toBeLessThan(0.05);
    expect(batch.redosed).toBe(false);
  });

  it('takes a tighter tolerance from the caller', () => {
    const batch = planBatch(
      { id: 'B25-00304', machine: jet, recipe, lots: [lot('G1', 195)], ratioTolerance: 0.001 },
      context
    );
    expect(batch.redosed).toBe(true);
  });

  it('refuses a load the machine cannot take and says why', () => {
    expect(() =>
      planBatch({ id: 'B25-00305', machine: jet, recipe, lots: [lot('G1', 30)] }, context)
    ).toThrow(/total 30.0 kg is below-minimum/);
    expect(() =>
      planBatch({ id: 'B25-00306', machine: jet, recipe, lots: [lot('G1', 400)] }, context)
    ).toThrow(/above-maximum/);
  });

  it('keeps the lot numbers on the batch', () => {
    const batch = planBatch(
      { id: 'B25-00307', machine: jet, recipe, lots: [lot('G1', 120), lot('G2', 80)] },
      context
    );
    expect(batch.lotIds).toEqual(['G1', 'G2']);
    expect(Object.isFrozen(batch)).toBe(true);
  });

  it('needs at least one lot', () => {
    expect(() => planBatch({ id: 'B25-1', machine: jet, recipe, lots: [] }, context)).toThrow(
      /batch.lots/
    );
  });
});

describe('fill factor', () => {
  it('is the load against what the machine could take', () => {
    expect(fillFactor(jet, 300)).toBe(1);
    expect(fillFactor(jet, 150)).toBe(0.5);
  });
});

describe('the audit trail', () => {
  it('records nothing when no trail is passed', () => {
    const batch = planBatch(
      { id: 'B25-00401', machine: jet, recipe, lots: [lot('G1', 200)] },
      context
    );
    expect(batch.id).toBe('B25-00401');
  });

  it('records the plan and the card when one is', () => {
    const trail = createTrail({ clock: () => '2025-04-01T08:00:00Z' });
    planBatch(
      { id: 'B25-00402', machine: jet, recipe, lots: [lot('G1', 200)] },
      { ...context, trail }
    );
    expect(forSubject(trail, 'B25-00402').map((entry) => entry.event)).toEqual([
      'batch-planned',
      'card-issued',
    ]);
  });

  it('records the re-dose as its own entry, with the two ratios on it', () => {
    const trail = createTrail({ clock: () => '2025-04-01T08:00:00Z' });
    planBatch(
      { id: 'B25-00403', machine: jet, recipe, lots: [lot('G1', 100)] },
      { ...context, trail }
    );
    const redose = forSubject(trail, 'B25-00403').find((entry) => entry.event === 'recipe-redosed');
    expect(redose).toBeDefined();
    expect(redose.inputs.plannedRatio).toBe(8);
    expect(Number(redose.inputs.actualRatio)).toBeGreaterThan(8);
  });

  it('names the machine and the lot count on the plan entry', () => {
    const trail = createTrail({ clock: () => '2025-04-01T08:00:00Z' });
    planBatch(
      { id: 'B25-00404', machine: jet, recipe, lots: [lot('G1', 120), lot('G2', 80)] },
      { ...context, trail }
    );
    const planned = forSubject(trail, 'B25-00404')[0];
    expect(planned.inputs.machine).toBe('JET-4');
    expect(planned.inputs.lots).toBe(2);
    expect(planned.outcome).toMatch(/litres at/);
  });

  it('leaves the trail intact after a run of batches', () => {
    const trail = createTrail({ clock: () => '2025-04-01T08:00:00Z' });
    for (const id of ['B1', 'B2', 'B3']) {
      planBatch({ id, machine: jet, recipe, lots: [lot('G1', 200)] }, { ...context, trail });
    }
    expect(verify(trail).intact).toBe(true);
    expect(trail.entries).toHaveLength(6);
  });
});

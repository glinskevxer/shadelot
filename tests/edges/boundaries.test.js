/**
 * The boundaries.
 *
 * Every rule in this program has an edge, and the edge is where the arguments
 * happen: a shade sitting exactly on a tolerance, a load exactly at a machine
 * minimum, a depth exactly on a band line. This file pins which way each of
 * them falls, in one place, so a change to any of them is visible as a change
 * to this file rather than as a surprise on the floor.
 */

import { describe, expect, it } from 'vitest';
import { dispensable, roundToStep } from '../../src/measure/rounding.js';
import { depthBand } from '../../src/recipe/depth.js';
import { assessFit } from '../../src/batch/plan.js';
import { makeMachine } from '../../src/machine/register.js';
import { makeLab } from '../../src/colour/lab.js';
import { judge, makeTolerance } from '../../src/colour/tolerance.js';
import { pointsFor } from '../../src/quality/defects.js';
import { changeover } from '../../src/schedule/sequence.js';
import { ceilingMetres, deliver, makeOrder } from '../../src/order/order.js';
import { gradeSeparation } from '../../src/dyestuff/compatibility.js';
import { stainingRisk } from '../../src/process/wash.js';
import { createCatalogue, makeDyestuff } from '../../src/dyestuff/catalogue.js';
import { createChemicalStore } from '../../src/chemical/catalogue.js';
import { makeRecipe } from '../../src/recipe/recipe.js';

describe('rounding sits on the half', () => {
  it('goes away from zero, never to the even neighbour', () => {
    expect(roundToStep(0.0125, 0.001)).toBe(0.013);
    expect(roundToStep(0.0135, 0.001)).toBe(0.014);
    expect(roundToStep(-0.0125, 0.001)).toBe(-0.013);
  });

  it('takes a dispense exactly on the tolerance', () => {
    const result = dispensable(0.02, { tolerance: 0.02 });
    expect(result.amount).toBeGreaterThan(0);
  });
});

describe('a shade exactly on a band line', () => {
  it('takes the lower band', () => {
    expect(depthBand(0.5).name).toBe('pale');
    expect(depthBand(1).name).toBe('light');
    expect(depthBand(2).name).toBe('medium');
    expect(depthBand(4).name).toBe('dark');
  });

  it('steps up on the smallest amount past it', () => {
    expect(depthBand(4.0000001).name).toBe('heavy');
  });
});

describe('a load exactly at a machine limit', () => {
  const jet = makeMachine({
    id: 'JET-4',
    type: 'jet',
    minLoadKg: 60,
    maxLoadKg: 300,
    deadVolumeLitres: 900,
    litresPerKg: 3.5,
  });
  const catalogue = createCatalogue([
    makeDyestuff({ code: 'B', name: 'Blue', supplier: 'A', dyeClass: 'reactive', pricePerKg: 24 }),
  ]);
  const recipe = makeRecipe(
    {
      id: 'R1',
      name: 'r',
      process: 'exhaust',
      substrate: 'cotton',
      liquorRatio: 8,
      dyes: [{ code: 'B', owf: 1 }],
    },
    { catalogue, chemicals: createChemicalStore([]) }
  );

  it('fits at both ends of the band', () => {
    expect(assessFit(jet, recipe, 60).fits).toBe(true);
    expect(assessFit(jet, recipe, 300).fits).toBe(true);
  });

  it('does not a gram either side', () => {
    expect(assessFit(jet, recipe, 59.999).reason).toBe('below-minimum');
    expect(assessFit(jet, recipe, 300.001).reason).toBe('above-maximum');
  });
});

describe('a batch exactly on a tolerance', () => {
  const standard = makeLab(50, 0, 0);

  it('passes at the limit and fails past it', () => {
    const block = makeTolerance({ name: 'x', formula: 'cie76', total: 1, marginalAt: 1 });
    expect(judge(block, standard, makeLab(51, 0, 0)).verdict).toBe('pass');
    expect(judge(block, standard, makeLab(51.001, 0, 0)).verdict).toBe('fail');
  });

  it('is marginal above the marginal line and not on it', () => {
    const block = makeTolerance({ name: 'x', formula: 'cie76', total: 2, marginalAt: 1 });
    expect(judge(block, standard, makeLab(51, 0, 0)).verdict).toBe('pass');
    expect(judge(block, standard, makeLab(51.001, 0, 0)).verdict).toBe('marginal');
  });

  it('passes an axis exactly on its own limit', () => {
    const block = makeTolerance({ name: 'x', formula: 'cie76', total: 9, dL: 1 });
    expect(judge(block, standard, makeLab(51, 0, 0)).verdict).toBe('pass');
    expect(judge(block, standard, makeLab(51.001, 0, 0)).verdict).toBe('fail');
  });
});

describe('a fault exactly on a points boundary', () => {
  it('takes the lower points', () => {
    expect(pointsFor(7.6)).toBe(1);
    expect(pointsFor(15.2)).toBe(2);
    expect(pointsFor(22.9)).toBe(3);
  });
});

describe('a changeover with no depth movement', () => {
  const batch = (depth, dyeClass = 'reactive') => ({ id: 'B', depth, dyeClass });

  it('needs nothing at exactly the same depth', () => {
    expect(changeover(batch(2), batch(2)).clean).toBe('none');
  });

  it('needs a boil at exactly a band lighter', () => {
    expect(changeover(batch(2), batch(1)).clean).toBe('boil');
  });

  it('needs a strip at exactly three lighter', () => {
    expect(changeover(batch(4), batch(1)).clean).toBe('strip');
  });
});

describe('a delivery exactly on the ceiling', () => {
  const base = {
    id: 'O1',
    customer: 'K',
    quality: 'q',
    shade: 's',
    metres: 1000,
    dueAt: '2025-05-16',
  };

  it('is taken', () => {
    const order = makeOrder(base);
    deliver(order, { batchId: 'B1', metres: ceilingMetres(order) });
    expect(order.state).toBe('delivered');
  });

  it('is refused a metre past it', () => {
    const order = makeOrder(base);
    expect(() => deliver(order, { batchId: 'B1', metres: ceilingMetres(order) + 1 })).toThrow(
      /ceiling/
    );
  });
});

describe('the grading boundaries', () => {
  it('fall to the better grade on the line', () => {
    expect(gradeSeparation(0.12)).toBe('good');
    expect(gradeSeparation(0.28)).toBe('workable');
  });

  it('read staining risk on the ratio boundaries', () => {
    expect(stainingRisk(0.01)).toBe('clear');
    expect(stainingRisk(0.02)).toBe('acceptable');
    expect(stainingRisk(0.04)).toBe('marginal');
    expect(stainingRisk(0.0401)).toBe('will stain');
  });
});

import { describe, expect, it } from 'vitest';
import { makeConsent, checkConsent } from '../../src/effluent/load.js';
import {
  COST_PER_M3,
  REMOVAL,
  STAGES,
  prescribe,
  reductionNeeded,
  runningCost,
  sludgeKg,
  stageFor,
  treat,
} from '../../src/effluent/treatment.js';

const consent = makeConsent({
  name: 'trade effluent consent 4471',
  volumeM3: 300,
  codKg: 400,
  tdsKg: 900,
  colourUnits: 250,
});

const clean = { volumeM3: 180, codKg: 300, tdsKg: 700, colourUnits: 200 };
const dirty = { volumeM3: 180, codKg: 900, tdsKg: 700, colourUnits: 900 };

describe('the stages', () => {
  it('name the four the plant can run', () => {
    expect(STAGES).toEqual(['neutralise', 'coagulate', 'biological', 'polish']);
    expect(Object.keys(REMOVAL)).toEqual(STAGES);
    expect(Object.keys(COST_PER_M3)).toEqual(STAGES);
  });

  it('do different jobs, which is the point', () => {
    expect(REMOVAL.coagulate.colour).toBeGreaterThan(REMOVAL.biological.colour);
    expect(REMOVAL.biological.cod).toBeGreaterThan(REMOVAL.coagulate.cod);
  });

  it('let a stage add to a parameter it makes worse', () => {
    expect(REMOVAL.coagulate.tds).toBeLessThan(0);
  });

  it('refuse a stage nothing runs', () => {
    expect(() => stageFor('ozonate')).toThrow(/must be one of neutralise/);
  });
});

describe('treating a day', () => {
  it('leaves it alone through an empty train', () => {
    expect(treat(dirty, []).out).toEqual(dirty);
  });

  it('takes the colour down through coagulation', () => {
    const treated = treat(dirty, ['coagulate']).out;
    expect(treated.colourUnits).toBeCloseTo(900 * 0.2, 6);
  });

  it('takes the demand down through biological treatment', () => {
    const treated = treat(dirty, ['biological']).out;
    expect(treated.codKg).toBeCloseTo(900 * 0.25, 6);
    expect(treated.colourUnits).toBeGreaterThan(treated.codKg);
  });

  it('puts the dissolved solids up through coagulation', () => {
    expect(treat(dirty, ['coagulate']).out.tdsKg).toBeGreaterThan(dirty.tdsKg);
  });

  it('keeps a step per stage so the report can show the train', () => {
    const result = treat(dirty, ['neutralise', 'coagulate']);
    expect(result.steps.map((step) => step.stage)).toEqual(['neutralise', 'coagulate']);
    expect(result.steps[1].before.colourUnits).toBeLessThan(dirty.colourUnits);
  });
});

describe('what it costs to run', () => {
  it('is nothing for no treatment', () => {
    expect(runningCost(dirty, [])).toBe(0);
  });

  it('scales with the volume', () => {
    expect(runningCost({ ...dirty, volumeM3: 360 }, ['coagulate'])).toBeCloseTo(
      runningCost(dirty, ['coagulate']) * 2,
      6
    );
  });

  it('adds up over the train', () => {
    expect(runningCost(dirty, ['neutralise', 'coagulate'])).toBeCloseTo(
      runningCost(dirty, ['neutralise']) + runningCost(dirty, ['coagulate']),
      6
    );
  });

  it('refuses a price list with a stage missing', () => {
    expect(() => runningCost(dirty, ['polish'], { perM3: { neutralise: 0.1 } })).toThrow(
      /carries no price for polish/
    );
  });
});

describe('prescribing a train', () => {
  it('prescribes nothing for a day already inside', () => {
    const result = prescribe(consent, clean);
    expect(result.stages).toEqual([]);
    expect(result.reason).toMatch(/already inside/);
  });

  it('picks a train that gets a dirty day inside', () => {
    const result = prescribe(consent, dirty);
    expect(result.stages.length).toBeGreaterThan(0);
    expect(checkConsent(consent, treat(dirty, result.stages).out).compliant).toBe(true);
  });

  it('picks the cheapest that works rather than the biggest', () => {
    const result = prescribe(consent, dirty);
    expect(result.cost).toBeLessThan(runningCost(dirty, STAGES));
  });

  it('says so when nothing it can run will do it', () => {
    const impossible = { volumeM3: 180, codKg: 9000, tdsKg: 9000, colourUnits: 9000 };
    const result = prescribe(consent, impossible);
    expect(result.insufficient).toBe(true);
    expect(result.reason).toMatch(/the load has to come down instead/);
  });

  it('refuses to pretend treatment fixes a volume breach', () => {
    const flooded = { ...clean, volumeM3: 500 };
    expect(prescribe(consent, flooded).reason).toMatch(/no treatment makes water disappear/);
  });

  it('always includes a neutralise when the ph is what failed', () => {
    const result = prescribe(consent, clean, { ph: 11 });
    expect(result.stages).toContain('neutralise');
  });
});

describe('how far the load has to come down', () => {
  it('is nothing for a parameter inside the limit', () => {
    expect(reductionNeeded(consent, clean).cod).toBe(0);
  });

  it('is the share over for one that is not', () => {
    expect(reductionNeeded(consent, dirty).cod).toBeCloseTo(1 - 400 / 900, 9);
    expect(reductionNeeded(consent, dirty).colour).toBeCloseTo(1 - 250 / 900, 9);
  });
});

describe('the sludge', () => {
  it('is nothing without a coagulation', () => {
    expect(sludgeKg(dirty, ['biological'])).toBe(0);
  });

  it('rises with the colour taken off and the volume', () => {
    const small = sludgeKg(dirty, ['coagulate']);
    const large = sludgeKg({ ...dirty, volumeM3: 360 }, ['coagulate']);
    expect(large).toBeCloseTo(small * 2, 6);
    expect(small).toBeGreaterThan(0);
  });

  it('refuses a factor outside the scale', () => {
    expect(() => sludgeKg(dirty, ['coagulate'], { perColourUnit: 2 })).toThrow(/perColourUnit/);
  });
});

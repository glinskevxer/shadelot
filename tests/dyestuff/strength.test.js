import { describe, expect, it } from 'vitest';
import { createCatalogue, makeDyestuff } from '../../src/dyestuff/catalogue.js';
import {
  CONFIDENCE,
  ceilingOwf,
  equivalentDose,
  gradeSubstitution,
  proposeSubstitutes,
  requireConfidence,
  strengthFactor,
} from '../../src/dyestuff/strength.js';

const acme = makeDyestuff({
  code: 'RB-19-ACME',
  name: 'Brilliant Blue RR',
  supplier: 'Acme Colours',
  dyeClass: 'reactive',
  colourIndex: 'RB19',
  pricePerKg: 24,
  fastness: { wash: 4, light: 6 },
});

describe('matched depth arithmetic', () => {
  it('needs three quarters of the weight at a third more strength', () => {
    expect(equivalentDose(1.2, 100, 133)).toBeCloseTo(0.902256, 6);
    expect(strengthFactor(100, 133)).toBeCloseTo(0.75188, 5);
  });

  it('needs more of a weaker article', () => {
    expect(equivalentDose(1, 133, 100)).toBeCloseTo(1.33, 9);
  });

  it('is the identity at equal strength', () => {
    expect(equivalentDose(2.5, 100, 100)).toBe(2.5);
  });

  it('refuses a strength of zero rather than dividing by it', () => {
    expect(() => equivalentDose(1, 100, 0)).toThrow(/toStrength/);
    expect(() => strengthFactor(0, 100)).toThrow(/fromStrength/);
  });
});

describe('grading a substitution', () => {
  it('calls another class unsuitable whatever else matches', () => {
    const other = makeDyestuff({ ...acme, code: 'X', dyeClass: 'direct' });
    expect(gradeSubstitution(acme, other).confidence).toBe('unsuitable');
    expect(gradeSubstitution(acme, other).reason).toMatch(/classes differ/);
  });

  it('lets a fastness floor override a perfect colour index match', () => {
    const weak = makeDyestuff({
      ...acme,
      code: 'X',
      supplier: 'Acme Colours',
      fastness: { wash: 2 },
    });
    const graded = gradeSubstitution(acme, weak, { fastnessFloor: { wash: 4 } });
    expect(graded.confidence).toBe('unsuitable');
    expect(graded.reason).toMatch(/wash fastness is 2 against a floor of 4/);
  });

  it('treats an unpublished rating as a failure, not as a pass', () => {
    const quiet = makeDyestuff({ ...acme, code: 'X', supplier: 'Acme Colours' });
    const graded = gradeSubstitution(acme, quiet, { fastnessFloor: { rubWet: 3 } });
    expect(graded.confidence).toBe('unsuitable');
    expect(graded.reason).toMatch(/not published/);
  });

  it('passes a same house same index swap straight through', () => {
    const sibling = makeDyestuff({ ...acme, code: 'RB-19-ACME-HC', strength: 150 });
    expect(gradeSubstitution(acme, sibling).confidence).toBe('direct');
  });

  it('sends another house to the lab even at the same index', () => {
    const nord = makeDyestuff({ ...acme, code: 'RB-19-NORD', supplier: 'Nordfarben' });
    expect(gradeSubstitution(acme, nord).confidence).toBe('lab-check');
    expect(gradeSubstitution(acme, nord).reason).toMatch(/another house/);
  });

  it('sends an unrecorded colour index to the lab', () => {
    const blank = makeDyestuff({ ...acme, code: 'X', colourIndex: null });
    expect(gradeSubstitution(acme, blank).reason).toMatch(/no colour index recorded/);
  });
});

describe('proposing substitutes', () => {
  const catalogue = createCatalogue([
    acme,
    makeDyestuff({
      ...acme,
      code: 'RB-19-NORD',
      supplier: 'Nordfarben',
      strength: 133,
      pricePerKg: 30,
    }),
    makeDyestuff({
      ...acme,
      code: 'RB-19-DELT',
      supplier: 'Delta Dye',
      strength: 100,
      pricePerKg: 20,
    }),
    makeDyestuff({ ...acme, code: 'RB-19-WEAK', supplier: 'Weak Ltd', fastness: { wash: 1 } }),
  ]);

  it('never proposes the article itself', () => {
    expect(proposeSubstitutes(catalogue, 'RB-19-ACME').map((r) => r.code)).not.toContain(
      'RB-19-ACME'
    );
  });

  it('costs each candidate at matched depth rather than per kilogram', () => {
    const nord = proposeSubstitutes(catalogue, 'RB-19-ACME').find((r) => r.code === 'RB-19-NORD');
    expect(nord.factor).toBeCloseTo(0.75188, 5);
    expect(nord.costRatio).toBeCloseTo((30 * 0.75188) / 24, 4);
  });

  it('drops the unsuitable ones unless they are asked for', () => {
    const filtered = { fastnessFloor: { wash: 3 } };
    expect(proposeSubstitutes(catalogue, 'RB-19-ACME', filtered).map((r) => r.code)).not.toContain(
      'RB-19-WEAK'
    );
    const all = proposeSubstitutes(catalogue, 'RB-19-ACME', {
      ...filtered,
      includeUnsuitable: true,
    });
    expect(all.map((r) => r.code)).toContain('RB-19-WEAK');
  });

  it('orders by what can be said for them before it orders by price', () => {
    const rows = proposeSubstitutes(catalogue, 'RB-19-ACME', {
      includeUnsuitable: true,
      fastnessFloor: { wash: 3 },
    });
    expect(rows.at(-1).code).toBe('RB-19-WEAK');
    const cheapFirst = rows.filter((r) => r.confidence === 'lab-check').map((r) => r.code);
    expect(cheapFirst[0]).toBe('RB-19-DELT');
  });

  it('names the three confidences and refuses a fourth', () => {
    expect(CONFIDENCE).toEqual(['direct', 'lab-check', 'unsuitable']);
    expect(requireConfidence('direct')).toBe('direct');
    expect(() => requireConfidence('probably')).toThrow(/confidence/);
  });
});

describe('the dose ceiling', () => {
  it('is on the fibre, so a blend lowers it', () => {
    expect(ceilingOwf(acme, 1)).toBe(8);
    expect(ceilingOwf(acme, 0.65)).toBeCloseTo(5.2, 9);
  });

  it('refuses a share written as a percentage', () => {
    expect(() => ceilingOwf(acme, 65)).toThrow(/fraction, not a percentage/);
  });
});

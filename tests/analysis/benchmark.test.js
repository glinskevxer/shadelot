import { describe, expect, it } from 'vitest';
import {
  BANDS,
  VERDICTS,
  assess,
  assessWorks,
  bandFor,
  measures,
  needsAttention,
  position,
  requireVerdict,
  verdictFor,
} from '../../src/analysis/benchmark.js';

describe('the bands', () => {
  it('name every measure a dyehouse is compared on', () => {
    expect(measures()).toContain('litresPerKg');
    expect(measures()).toContain('rightFirstTime');
    expect(Object.keys(BANDS)).toEqual(measures());
  });

  it('say which direction is better for each', () => {
    expect(bandFor('litresPerKg').lowerIsBetter).toBe(true);
    expect(bandFor('rightFirstTime').lowerIsBetter).toBe(false);
  });

  it('put typical between best and poor whichever way round they are', () => {
    for (const measure of measures()) {
      const band = bandFor(measure);
      const low = Math.min(band.best, band.poor);
      const high = Math.max(band.best, band.poor);
      expect(band.typical).toBeGreaterThan(low);
      expect(band.typical).toBeLessThan(high);
    }
  });

  it('refuse a measure nothing publishes', () => {
    expect(() => bandFor('happiness')).toThrow(/must be one of litresPerKg/);
  });
});

describe('the position in a band', () => {
  it('reads one at the best figure and nothing at the poor one', () => {
    expect(position('litresPerKg', 30)).toBeCloseTo(1, 9);
    expect(position('litresPerKg', 140)).toBeCloseTo(0, 9);
  });

  it('reads the same way for a measure where higher is better', () => {
    expect(position('rightFirstTime', 0.95)).toBeCloseTo(1, 9);
    expect(position('rightFirstTime', 0.7)).toBeCloseTo(0, 9);
  });

  it('clamps rather than reporting a triumph', () => {
    expect(position('litresPerKg', 5)).toBe(1);
    expect(position('litresPerKg', 400)).toBe(0);
    expect(position('rightFirstTime', 0.99)).toBe(1);
  });

  it('refuses a value of nothing', () => {
    expect(() => position('litresPerKg', 0)).toThrow(/litresPerKg/);
  });
});

describe('the verdict', () => {
  it('reads best at the best figure and poor at the poor one', () => {
    expect(verdictFor('litresPerKg', 30)).toBe('best');
    expect(verdictFor('litresPerKg', 200)).toBe('poor');
  });

  it('reads typical at the typical figure', () => {
    expect(verdictFor('litresPerKg', 70)).toBe('typical');
    expect(verdictFor('rightFirstTime', 0.85)).toBe('typical');
  });

  it('reads behind between poor and typical', () => {
    expect(verdictFor('litresPerKg', 110)).toBe('behind');
  });

  it('reads good between typical and best', () => {
    expect(verdictFor('litresPerKg', 45)).toBe('good');
  });

  it('names the five and refuses a sixth', () => {
    expect(VERDICTS).toEqual(['best', 'good', 'typical', 'behind', 'poor']);
    expect(requireVerdict('good')).toBe('good');
    expect(() => requireVerdict('excellent')).toThrow(/verdict/);
  });
});

describe('one measure assessed', () => {
  it('says how far it is from typical and from best', () => {
    const row = assess('litresPerKg', 90);
    expect(row.gapToTypical).toBeCloseTo(20, 9);
    expect(row.gapToBest).toBeCloseTo(60, 9);
  });

  it('reads the gaps the other way for a measure where higher is better', () => {
    const row = assess('rightFirstTime', 0.8);
    expect(row.gapToTypical).toBeCloseTo(0.05, 9);
    expect(row.gapToBest).toBeCloseTo(0.15, 9);
  });

  it('carries the units so a report can print them', () => {
    expect(assess('kwhPerKg', 6).units).toBe('kWh per kg');
  });
});

describe('a whole works', () => {
  const values = {
    litresPerKg: 95,
    kwhPerKg: 4.2,
    rightFirstTime: 0.78,
    costPerKg: 1.6,
    utilisation: 0.55,
    fixation: 0.74,
  };

  it('orders worst first, which is the order to spend money in', () => {
    const assessment = assessWorks(values);
    for (let i = 1; i < assessment.rows.length; i += 1) {
      expect(assessment.rows[i - 1].position).toBeLessThanOrEqual(assessment.rows[i].position);
    }
    expect(assessment.worst.measure).toBe(assessment.rows[0].measure);
  });

  it('ignores a figure it does not benchmark rather than failing', () => {
    const assessment = assessWorks({ ...values, staffTurnover: 0.2 });
    expect(assessment.rows.map((row) => row.measure)).not.toContain('staffTurnover');
  });

  it('refuses a set with nothing it recognises in it', () => {
    expect(() => assessWorks({ staffTurnover: 0.2 })).toThrow(/names nothing this benchmarks/);
  });

  it('reports a mean position over everything it read', () => {
    const assessment = assessWorks(values);
    expect(assessment.mean).toBeGreaterThan(0);
    expect(assessment.mean).toBeLessThan(1);
  });
});

describe('whether it is worth a project', () => {
  it('says yes when several measures are well behind', () => {
    const assessment = assessWorks({ litresPerKg: 130, rightFirstTime: 0.72, utilisation: 0.42 });
    const result = needsAttention(assessment);
    expect(result.needed).toBe(true);
    expect(result.behind.length).toBeGreaterThanOrEqual(2);
  });

  it('says no for a works that is only behind on one thing', () => {
    const assessment = assessWorks({ litresPerKg: 130, rightFirstTime: 0.94, utilisation: 0.8 });
    expect(needsAttention(assessment).needed).toBe(false);
  });

  it('takes a works with a different idea of behind', () => {
    const assessment = assessWorks({ litresPerKg: 70, rightFirstTime: 0.85 });
    expect(needsAttention(assessment, { threshold: 0.9, count: 1 }).needed).toBe(true);
  });

  it('refuses a threshold outside the scale', () => {
    const assessment = assessWorks({ litresPerKg: 70 });
    expect(() => needsAttention(assessment, { threshold: 1.4 })).toThrow(/threshold/);
  });
});

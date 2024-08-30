import { describe, expect, it } from 'vitest';
import {
  CLEAN_MINUTES,
  changeover,
  dayLoad,
  depthOf,
  sequenceCost,
  sequenceDay,
  sequencingSaving,
} from '../../src/schedule/sequence.js';

const batch = (id, depth, extra = {}) => ({
  id,
  depth,
  dyeClass: 'reactive',
  runMinutes: 180,
  ...extra,
});

describe('a changeover', () => {
  it('needs a rinse before the first batch of the run', () => {
    expect(changeover(null, batch('B1', 1)).clean).toBe('rinse');
  });

  it('needs nothing going darker', () => {
    expect(changeover(batch('B1', 0.4), batch('B2', 2)).minutes).toBe(0);
    expect(changeover(batch('B1', 2), batch('B2', 2)).clean).toBe('none');
  });

  it('needs a rinse for a small step lighter', () => {
    expect(changeover(batch('B1', 1.2), batch('B2', 0.8)).clean).toBe('rinse');
  });

  it('needs a boil for a band or more', () => {
    expect(changeover(batch('B1', 2.4), batch('B2', 1.1)).clean).toBe('boil');
  });

  it('needs a strip for a black before a beige', () => {
    const step = changeover(batch('B1', 5.5), batch('B2', 0.3));
    expect(step.clean).toBe('strip');
    expect(step.minutes).toBe(CLEAN_MINUTES.strip);
  });

  it('needs a boil when the class changes whichever way the depth goes', () => {
    const darker = changeover(batch('B1', 0.4), batch('B2', 3, { dyeClass: 'disperse' }));
    expect(darker.clean).toBe('boil');
    expect(darker.reason).toMatch(/dye class changes/);
  });
});

describe('the cost of a sequence', () => {
  it('adds the cleaning to the running', () => {
    const { minutes, steps } = sequenceCost([batch('B1', 0.4), batch('B2', 2)]);
    expect(steps).toHaveLength(2);
    expect(minutes).toBe(CLEAN_MINUTES.rinse + 180 + 0 + 180);
  });

  it('is nothing for no batches at all', () => {
    expect(sequenceCost([]).minutes).toBe(0);
  });

  it('names the batch each step belongs to', () => {
    expect(sequenceCost([batch('B1', 1)]).steps[0].batchId).toBe('B1');
  });
});

describe('ordering a day', () => {
  it('runs light to dark', () => {
    const day = sequenceDay([batch('B1', 3), batch('B2', 0.4), batch('B3', 1.2)]);
    expect(day.map((b) => b.id)).toEqual(['B2', 'B3', 'B1']);
  });

  it('keeps the classes apart rather than interleaving them', () => {
    const day = sequenceDay([
      batch('B1', 3),
      batch('B2', 0.4, { dyeClass: 'disperse' }),
      batch('B3', 1.2),
    ]);
    expect(day.map((b) => b.dyeClass)).toEqual(['disperse', 'reactive', 'reactive']);
  });

  it('pulls an urgent batch to the front of its class', () => {
    const day = sequenceDay(
      [batch('B1', 0.4), batch('B2', 3, { dueAt: '2025-04-01' }), batch('B3', 1.2)],
      { urgentBefore: '2025-04-02' }
    );
    expect(day[0].id).toBe('B2');
  });

  it('ignores due dates when no urgent window is given', () => {
    const day = sequenceDay([batch('B1', 0.4), batch('B2', 3, { dueAt: '2025-04-01' })]);
    expect(day[0].id).toBe('B1');
  });

  it('breaks a tie on the batch number so the order never shuffles', () => {
    const day = sequenceDay([batch('B9', 1), batch('B2', 1), batch('B5', 1)]);
    expect(day.map((b) => b.id)).toEqual(['B2', 'B5', 'B9']);
  });

  it('does not touch the list it was given', () => {
    const given = [batch('B1', 3), batch('B2', 0.4)];
    sequenceDay(given);
    expect(given.map((b) => b.id)).toEqual(['B1', 'B2']);
  });
});

describe('what the sequencing saved', () => {
  it('is positive when the batches arrived in the worst order', () => {
    const saving = sequencingSaving([batch('B1', 5.5), batch('B2', 0.3), batch('B3', 2)]);
    expect(saving.savedMinutes).toBeGreaterThan(0);
    expect(saving.order).toEqual(['B2', 'B3', 'B1']);
  });

  it('is nothing when they already arrived light to dark', () => {
    const saving = sequencingSaving([batch('B1', 0.3), batch('B2', 2), batch('B3', 5.5)]);
    expect(saving.savedMinutes).toBe(0);
  });
});

describe('the day load', () => {
  it('counts cleaning towards the hours', () => {
    const load = dayLoad([batch('B1', 0.4), batch('B2', 2)]);
    expect(load.hours).toBeCloseTo((20 + 180 + 180) / 60, 6);
    expect(load.utilisation).toBeCloseTo(load.hours / 24, 6);
    expect(load.overrun).toBe(0);
  });

  it('reports an overrun against a shorter day', () => {
    const load = dayLoad([batch('B1', 0.4), batch('B2', 2)], { hoursAvailable: 5 });
    expect(load.overrun).toBeGreaterThan(0);
  });

  it('refuses a day of no hours', () => {
    expect(() => dayLoad([], { hoursAvailable: 0 })).toThrow(/hoursAvailable/);
  });
});

describe('reading a depth off a recipe', () => {
  it('takes the total dye percentage', () => {
    expect(depthOf({ totalOwf: 2.4 })).toBe(2.4);
    expect(depthOf({})).toBe(0);
  });
});

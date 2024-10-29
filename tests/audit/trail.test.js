import { beforeEach, describe, expect, it } from 'vitest';
import {
  EVENTS,
  append,
  createTrail,
  forSubject,
  merge,
  narrate,
  ofEvent,
  verify,
} from '../../src/audit/trail.js';

const fixedClock = (times) => {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)];
};

describe('appending', () => {
  let trail;
  beforeEach(() => {
    trail = createTrail({ clock: fixedClock(['2025-04-01T08:00:00Z', '2025-04-01T09:00:00Z']) });
  });

  it('numbers the entries from one', () => {
    append(trail, 'batch-planned', { subject: 'B25-00301' });
    append(trail, 'card-issued', { subject: 'B25-00301' });
    expect(trail.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
  });

  it('stamps the time off the clock it was given', () => {
    const entry = append(trail, 'batch-planned', { subject: 'B1' });
    expect(entry.at).toBe('2025-04-01T08:00:00Z');
  });

  it('records the program as the actor unless somebody is named', () => {
    expect(append(trail, 'batch-planned', { subject: 'B1' }).by).toBe('shadelot');
    expect(append(trail, 'batch-planned', { subject: 'B1', by: 'j.hollis' }).by).toBe('j.hollis');
  });

  it('keeps the inputs that produced the decision', () => {
    const entry = append(trail, 'recipe-redosed', {
      subject: 'B1',
      inputs: { plannedRatio: 8, actualRatio: 12.4 },
      outcome: 'the grams per litre lines were scaled',
    });
    expect(entry.inputs).toEqual({ plannedRatio: 8, actualRatio: 12.4 });
    expect(entry.outcome).toMatch(/scaled/);
  });

  it('freezes an entry so nothing can edit it afterwards', () => {
    const entry = append(trail, 'batch-planned', { subject: 'B1' });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.inputs)).toBe(true);
  });

  it('refuses an event nothing records', () => {
    expect(() => append(trail, 'batch-forgotten', { subject: 'B1' })).toThrow(/event/);
    expect(EVENTS).toContain('shade-judged');
  });

  it('refuses an entry with no subject', () => {
    expect(() => append(trail, 'batch-planned', {})).toThrow(/detail.subject/);
  });
});

describe('reading it back', () => {
  let trail;
  beforeEach(() => {
    trail = createTrail({ clock: fixedClock(['2025-04-01T08:00:00Z']) });
    append(trail, 'batch-planned', { subject: 'B1' });
    append(trail, 'shade-judged', { subject: 'B1', outcome: 'pass' });
    append(trail, 'batch-planned', { subject: 'B2' });
  });

  it('filters by subject', () => {
    expect(forSubject(trail, 'B1')).toHaveLength(2);
    expect(forSubject(trail, 'B9')).toEqual([]);
  });

  it('filters by event', () => {
    expect(ofEvent(trail, 'batch-planned')).toHaveLength(2);
    expect(() => ofEvent(trail, 'nothing')).toThrow(/event/);
  });

  it('narrates one subject in order', () => {
    const lines = narrate(trail, 'B1');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/shade-judged, pass$/);
  });

  it('puts the inputs in the narration when there are any', () => {
    append(trail, 'recipe-redosed', { subject: 'B3', inputs: { from: 8, to: 12 } });
    expect(narrate(trail, 'B3')[0]).toMatch(/\(from 8, to 12\)/);
  });

  it('refuses to narrate a subject nothing happened to', () => {
    expect(() => narrate(trail, 'B9')).toThrow(/has nothing on the trail/);
  });
});

describe('verifying', () => {
  it('passes a trail built the ordinary way', () => {
    const trail = createTrail({
      clock: fixedClock(['2025-04-01T08:00:00Z', '2025-04-01T09:00:00Z']),
    });
    append(trail, 'batch-planned', { subject: 'B1' });
    append(trail, 'card-issued', { subject: 'B1' });
    expect(verify(trail)).toEqual({ intact: true, problems: [] });
  });

  it('spots a missing entry', () => {
    const trail = createTrail({ clock: () => '2025-04-01T08:00:00Z' });
    append(trail, 'batch-planned', { subject: 'B1' });
    append(trail, 'card-issued', { subject: 'B1' });
    trail.entries.splice(0, 1);
    const result = verify(trail);
    expect(result.intact).toBe(false);
    expect(result.problems[0].problem).toMatch(/sequence is 2, expected 1/);
  });

  it('spots the clock going backwards', () => {
    const trail = createTrail({
      clock: fixedClock(['2025-04-01T09:00:00Z', '2025-04-01T08:00:00Z']),
    });
    append(trail, 'batch-planned', { subject: 'B1' });
    append(trail, 'card-issued', { subject: 'B1' });
    expect(verify(trail).problems.some((p) => p.problem === 'the clock went backwards')).toBe(true);
  });
});

describe('merging two halls', () => {
  it('interleaves by time and renumbers', () => {
    const hall = createTrail({
      clock: fixedClock(['2025-04-01T08:00:00Z', '2025-04-01T10:00:00Z']),
    });
    append(hall, 'batch-planned', { subject: 'B1' });
    append(hall, 'card-issued', { subject: 'B1' });
    const finishing = createTrail({ clock: fixedClock(['2025-04-01T09:00:00Z']) });
    append(finishing, 'shade-judged', { subject: 'B1' });

    const merged = merge([hall, finishing]);
    expect(merged.entries.map((entry) => entry.event)).toEqual([
      'batch-planned',
      'shade-judged',
      'card-issued',
    ]);
    expect(merged.entries.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect(verify(merged).intact).toBe(true);
  });

  it('refuses to merge nothing', () => {
    expect(() => merge([])).toThrow(/at least 1 entries/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  RISKS,
  barreRisk,
  beamOf,
  provenance,
  rollsFromBeam,
  splitByBeam,
  yarnLotsOf,
} from '../../src/greige/beam.js';

const roll = (id, beam, yarnLots = []) => ({ id, beam, yarnLots });

describe('reading the provenance off a roll', () => {
  it('gives nothing when nothing was recorded', () => {
    expect(beamOf({ id: 'R1' })).toBeNull();
    expect(yarnLotsOf({ id: 'R1' })).toEqual([]);
  });

  it('gives what was', () => {
    expect(beamOf(roll('R1', 'W-881'))).toBe('W-881');
    expect(yarnLotsOf(roll('R1', 'W-881', ['Y-14', 'Y-15']))).toEqual(['Y-14', 'Y-15']);
  });

  it('refuses a beam that is not a string', () => {
    expect(() => beamOf({ id: 'R1', beam: 881 })).toThrow(/roll.beam/);
  });
});

describe('the provenance of a set', () => {
  it('collects the distinct beams and yarn lots', () => {
    const rolls = [roll('R1', 'W-881', ['Y-14']), roll('R2', 'W-881', ['Y-14', 'Y-15'])];
    const found = provenance(rolls);
    expect(found.beams).toEqual(['W-881']);
    expect(found.yarnLots).toEqual(['Y-14', 'Y-15']);
    expect(found.unrecorded).toBe(0);
  });

  it('counts the rolls that carry nothing', () => {
    const found = provenance([roll('R1', 'W-881'), { id: 'R2' }]);
    expect(found.unrecorded).toBe(1);
  });

  it('sorts so a printed list does not shuffle', () => {
    const found = provenance([roll('R1', 'W-901'), roll('R2', 'W-881')]);
    expect(found.beams).toEqual(['W-881', 'W-901']);
  });

  it('refuses an empty set', () => {
    expect(() => provenance([])).toThrow(/at least 1 entries/);
  });
});

describe('the barre risk', () => {
  it('is nothing for one beam and a couple of yarn lots', () => {
    const rolls = [roll('R1', 'W-881', ['Y-14']), roll('R2', 'W-881', ['Y-15'])];
    expect(barreRisk(rolls).risk).toBe('none');
  });

  it('is high for two beams in one lot', () => {
    const rolls = [roll('R1', 'W-881'), roll('R2', 'W-901')];
    const result = barreRisk(rolls);
    expect(result.risk).toBe('high');
    expect(result.reason).toMatch(/2 beams in one lot/);
  });

  it('is a watch for too many yarn lots on one beam', () => {
    const rolls = [roll('R1', 'W-881', ['Y-1', 'Y-2', 'Y-3', 'Y-4'])];
    expect(barreRisk(rolls).risk).toBe('watch');
  });

  it('is unknown when a roll carries no beam, which is not the same as low', () => {
    const rolls = [roll('R1', 'W-881'), { id: 'R2' }];
    const result = barreRisk(rolls);
    expect(result.risk).toBe('unknown');
    expect(result.reason).toMatch(/1 of 2 rolls carry no beam/);
  });

  it('says so plainly when nothing at all is recorded', () => {
    expect(barreRisk([{ id: 'R1' }]).reason).toMatch(/no beam is recorded on any roll/);
  });

  it('takes a works that will run two beams together', () => {
    const rolls = [roll('R1', 'W-881'), roll('R2', 'W-901')];
    expect(barreRisk(rolls, { allowBeams: 2 }).risk).toBe('none');
  });

  it('names the four risks', () => {
    expect(RISKS).toEqual(['none', 'watch', 'high', 'unknown']);
  });
});

describe('splitting by beam', () => {
  it('makes one group per beam, in order', () => {
    const rolls = [roll('R1', 'W-901'), roll('R2', 'W-881'), roll('R3', 'W-901')];
    const groups = splitByBeam(rolls);
    expect(groups.map((group) => group.beam)).toEqual(['W-881', 'W-901']);
    expect(groups[1].rolls.map((r) => r.id)).toEqual(['R1', 'R3']);
  });

  it('refuses to split when a roll carries no beam', () => {
    expect(() => splitByBeam([roll('R1', 'W-881'), { id: 'R2' }])).toThrow(
      /is not recorded, the rolls cannot be split/
    );
  });
});

describe('answering a complaint', () => {
  it('names the rolls that came off a beam', () => {
    const rolls = [roll('R1', 'W-881'), roll('R2', 'W-901'), roll('R3', 'W-881')];
    expect(rollsFromBeam(rolls, 'W-881')).toEqual(['R1', 'R3']);
  });

  it('gives nothing for a beam that never ran', () => {
    expect(rollsFromBeam([roll('R1', 'W-881')], 'W-999')).toEqual([]);
  });

  it('refuses an unnamed beam', () => {
    expect(() => rollsFromBeam([], '')).toThrow(/beam/);
  });
});

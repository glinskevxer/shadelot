import { describe, expect, it } from 'vitest';
import {
  MACHINE_TYPES,
  TYPE_PROCESSES,
  bathVolume,
  createMachineRegister,
  findMachine,
  liquorRatioAt,
  liquorRatioBand,
  loadForRatio,
  machinesForProcess,
  makeMachine,
} from '../../src/machine/register.js';

const jet = makeMachine({
  id: 'JET-4',
  type: 'jet',
  minLoadKg: 60,
  maxLoadKg: 300,
  deadVolumeLitres: 900,
  litresPerKg: 3.5,
  ports: 4,
  heatingKw: 180,
  maxTemperature: 135,
});

describe('making a machine', () => {
  it('takes the processes off the type', () => {
    expect(jet.processes).toEqual(['exhaust']);
    expect(makeMachine({ ...jet, id: 'PAD-1', type: 'pad-mangle' }).processes).toEqual([
      'pad-batch',
      'pad-steam',
    ]);
    expect(Object.keys(TYPE_PROCESSES)).toEqual(MACHINE_TYPES);
  });

  it('refuses a load band the wrong way round', () => {
    expect(() => makeMachine({ ...jet, id: 'X', minLoadKg: 300, maxLoadKg: 60 })).toThrow(
      /must sit below the maximum load/
    );
  });

  it('refuses equal ends of the band, which would be a single load size', () => {
    expect(() => makeMachine({ ...jet, id: 'X', minLoadKg: 300, maxLoadKg: 300 })).toThrow(
      /minLoadKg/
    );
  });

  it('defaults a single port and a boiling machine', () => {
    const plain = makeMachine({
      id: 'WIN-1',
      type: 'winch',
      minLoadKg: 40,
      maxLoadKg: 160,
      deadVolumeLitres: 600,
      litresPerKg: 5,
    });
    expect(plain.ports).toBe(1);
    expect(plain.maxTemperature).toBe(98);
    expect(plain.heatingKw).toBeNull();
  });

  it('refuses a type nothing in the hall is', () => {
    expect(() => makeMachine({ ...jet, id: 'X', type: 'kier' })).toThrow(/machine.type/);
  });
});

describe('what the bath actually does', () => {
  it('carries the dead volume at every load', () => {
    expect(bathVolume(jet, 300)).toBe(1950);
    expect(bathVolume(jet, 60)).toBe(1110);
  });

  it('runs its tightest ratio at a full load', () => {
    expect(liquorRatioAt(jet, 300)).toBeCloseTo(6.5, 9);
    expect(liquorRatioAt(jet, 60)).toBeCloseTo(18.5, 9);
    const band = liquorRatioBand(jet);
    expect(band.tightest).toBeLessThan(band.loosest);
  });

  it('refuses to work a ratio for a load of zero', () => {
    expect(() => liquorRatioAt(jet, 0)).toThrow(/fibreKg/);
  });
});

describe('finding the load for a wanted ratio', () => {
  it('gives the load that lands on it', () => {
    const load = loadForRatio(jet, 8);
    expect(load).toBeCloseTo(200, 6);
    expect(liquorRatioAt(jet, load)).toBeCloseTo(8, 9);
  });

  it('says nothing rather than proposing a load outside the band', () => {
    expect(loadForRatio(jet, 30)).toBeNull();
    expect(loadForRatio(jet, 6)).toBeNull();
  });

  it('says nothing for a ratio below what the plumbing alone uses', () => {
    expect(loadForRatio(jet, 3.5)).toBeNull();
    expect(loadForRatio(jet, 2)).toBeNull();
  });
});

describe('the register', () => {
  const register = createMachineRegister([
    jet,
    makeMachine({
      id: 'JIG-2',
      type: 'jig',
      minLoadKg: 30,
      maxLoadKg: 120,
      deadVolumeLitres: 400,
      litresPerKg: 2,
    }),
  ]);

  it('finds by id and says so when it cannot', () => {
    expect(findMachine(register, 'JIG-2').type).toBe('jig');
    expect(() => findMachine(register, 'JET-9')).toThrow(/not in the machine register/);
  });

  it('refuses two machines with the same number painted on them', () => {
    expect(() => createMachineRegister([jet, jet])).toThrow(/appears twice/);
  });

  it('lists what can run a process', () => {
    expect(machinesForProcess(register, 'exhaust').map((m) => m.id)).toEqual(['JET-4', 'JIG-2']);
    expect(machinesForProcess(register, 'jig').map((m) => m.id)).toEqual(['JIG-2']);
    expect(machinesForProcess(register, 'pad-batch')).toEqual([]);
  });

  it('starts empty without complaint', () => {
    expect(createMachineRegister().size).toBe(0);
  });
});

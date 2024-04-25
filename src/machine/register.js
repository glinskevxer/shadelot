/**
 * The machine register.
 *
 * Each machine has a load band and a liquor ratio band, and the two are not
 * independent: a jet run at half its nominal load does not run at half the
 * liquor, because the bath still has to cover the nozzles. The register holds
 * the fixed bath volume separately for exactly this reason.
 */

import {
  FieldError,
  requireArray,
  requireInteger,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const MACHINE_TYPES = ['jet', 'winch', 'jig', 'beam', 'package', 'pad-mangle'];

/** Which processes each machine type can actually run. */
export const TYPE_PROCESSES = Object.freeze({
  jet: ['exhaust'],
  winch: ['exhaust'],
  jig: ['jig', 'exhaust'],
  beam: ['exhaust'],
  package: ['package'],
  'pad-mangle': ['pad-batch', 'pad-steam'],
});

export function makeMachine(input) {
  const id = requireText(input.id, 'machine.id', { maxLength: 24 });
  const type = requireOneOf(input.type, 'machine.type', MACHINE_TYPES);
  const minLoadKg = requirePositive(input.minLoadKg, 'machine.minLoadKg');
  const maxLoadKg = requirePositive(input.maxLoadKg, 'machine.maxLoadKg');
  if (minLoadKg >= maxLoadKg) {
    throw new FieldError('machine.minLoadKg', 'must sit below the maximum load', minLoadKg);
  }
  const deadVolumeLitres = requirePositive(input.deadVolumeLitres, 'machine.deadVolumeLitres');
  const litresPerKg = requirePositive(input.litresPerKg, 'machine.litresPerKg');
  const ports = optional(input.ports, (v) => requireInteger(v, 'machine.ports'), 1);
  const heatingKw = optional(input.heatingKw, (v) => requirePositive(v, 'machine.heatingKw'), null);
  const maxTemperature = optional(
    input.maxTemperature,
    (v) => requirePositive(v, 'machine.maxTemperature'),
    98
  );

  return Object.freeze({
    id,
    type,
    minLoadKg,
    maxLoadKg,
    deadVolumeLitres,
    litresPerKg,
    ports,
    heatingKw,
    maxTemperature,
    processes: Object.freeze([...TYPE_PROCESSES[type]]),
  });
}

/**
 * Bath volume for a load. The dead volume is there whatever the load, so the
 * ratio moves as the load moves and there is nothing the dyer can do about it.
 */
export function bathVolume(machine, fibreKg) {
  requirePositive(fibreKg, 'fibreKg');
  return machine.deadVolumeLitres + machine.litresPerKg * fibreKg;
}

export function liquorRatioAt(machine, fibreKg) {
  return bathVolume(machine, fibreKg) / requirePositive(fibreKg, 'fibreKg');
}

/** The ratio band the machine can reach, tightest at a full load. */
export function liquorRatioBand(machine) {
  return {
    tightest: liquorRatioAt(machine, machine.maxLoadKg),
    loosest: liquorRatioAt(machine, machine.minLoadKg),
  };
}

/** The load that would land on a wanted liquor ratio, or null when none can. */
export function loadForRatio(machine, ratio) {
  requirePositive(ratio, 'ratio');
  const denominator = ratio - machine.litresPerKg;
  if (denominator <= 0) return null;
  const load = machine.deadVolumeLitres / denominator;
  if (load < machine.minLoadKg || load > machine.maxLoadKg) return null;
  return load;
}

export function createMachineRegister(machines = []) {
  const byId = new Map();
  for (const machine of requireArray(machines, 'machines')) {
    if (byId.has(machine.id)) {
      throw new FieldError('machine.id', 'appears twice in the register', machine.id);
    }
    byId.set(machine.id, machine);
  }
  return byId;
}

export function findMachine(register, id) {
  const machine = register.get(requireText(id, 'id', { maxLength: 24 }));
  if (!machine) {
    throw new FieldError('id', 'is not in the machine register', id);
  }
  return machine;
}

export function machinesForProcess(register, process) {
  return [...register.values()].filter((machine) => machine.processes.includes(process));
}

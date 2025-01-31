/**
 * The works file.
 *
 * One document describes the plant: the dyes it stocks, the chemicals, the
 * machines, and the two electrolyte codes the works doses by default. Every
 * command that needs any of it loads the same file, so a machine added once is
 * added everywhere.
 */

import { createCatalogue, makeDyestuff } from '../dyestuff/catalogue.js';
import { createChemicalStore, makeChemical } from '../chemical/catalogue.js';
import { createMachineRegister, makeMachine } from '../machine/register.js';
import { makeTolerance } from '../colour/tolerance.js';
import { dataError } from './exit.js';
import { readObject } from './io.js';

function requireList(document, key, path) {
  const value = document[key];
  if (!Array.isArray(value)) {
    throw dataError(`the works file ${path} must carry a ${key} array`);
  }
  return value;
}

function build(list, make, key, path) {
  return list.map((entry, index) => {
    try {
      return make(entry);
    } catch (error) {
      throw dataError(`${path}: ${key}[${index}] is not usable, ${error.message}`);
    }
  });
}

export function assembleWorks(document, path = 'the works file') {
  const catalogue = createCatalogue(
    build(requireList(document, 'dyestuffs', path), makeDyestuff, 'dyestuffs', path)
  );
  const chemicals = createChemicalStore(
    build(requireList(document, 'chemicals', path), makeChemical, 'chemicals', path)
  );
  const machines = createMachineRegister(
    build(requireList(document, 'machines', path), makeMachine, 'machines', path)
  );
  const tolerances = new Map();
  for (const entry of document.tolerances ?? []) {
    const block = makeTolerance(entry);
    tolerances.set(block.name, block);
  }
  return {
    name: document.name ?? 'unnamed works',
    catalogue,
    chemicals,
    machines,
    tolerances,
    saltCode: document.saltCode ?? null,
    alkaliCode: document.alkaliCode ?? null,
    tariff: document.tariff ?? null,
    consent: document.consent ?? null,
  };
}

export async function loadWorks(path) {
  const document = await readObject(path, { what: 'works file' });
  return assembleWorks(document, path);
}

export function toleranceNamed(works, name) {
  if (!name) return null;
  const block = works.tolerances.get(name);
  if (!block) {
    const known = [...works.tolerances.keys()].join(', ') || 'none';
    throw dataError(`the works file carries no tolerance called "${name}", it has ${known}`);
  }
  return block;
}

/**
 * Resolve the tolerance a command should judge under.
 *
 * Four commands were each carrying a copy of this, one of which loaded the
 * works file twice and one of which said "usage" where the other three said
 * "invalid data" for the identical mistake. The exit code is an interface, so
 * that one mattered.
 */
export async function resolveTolerance(options, fallback) {
  if (!options.tolerance) {
    return { block: fallback, works: null };
  }
  if (!options.works) {
    throw dataError('a named tolerance needs the works file it lives in');
  }
  const works = await loadWorks(options.works);
  return { block: toleranceNamed(works, options.tolerance), works };
}

/** Load the works file only when a command actually needs it. */
export async function worksIfNamed(options, { because }) {
  if (!options.works) {
    throw dataError(`${because} needs the works file it lives in`);
  }
  return loadWorks(options.works);
}

/**
 * Auxiliaries and salts.
 *
 * A chemical is dosed one of two ways and the difference matters more than
 * anything else about it. Percent on weight of fibre scales with the cloth.
 * Grams per litre scales with the liquor, which means it scales with the machine
 * and with how full the machine is, and a recipe that confuses the two comes out
 * right on a full load and wrong on a half load.
 */

import {
  FieldError,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const DOSE_BASIS = Object.freeze(['owf', 'gpl']);

export const ROLES = Object.freeze([
  'salt',
  'alkali',
  'acid',
  'wetting',
  'sequestrant',
  'levelling',
  'dispersing',
  'soaping',
  'softener',
  'oxidising',
  'reducing',
]);

/** Roles whose dose is set by the depth of shade rather than by the recipe author. */
export const DEPTH_DRIVEN = Object.freeze(['salt', 'alkali']);

export function makeChemical(input) {
  const code = requireText(input.code, 'chemical.code', { maxLength: 32 });
  const name = requireText(input.name, 'chemical.name', { maxLength: 80 });
  const role = requireOneOf(input.role, 'chemical.role', ROLES);
  const basis = requireOneOf(input.basis, 'chemical.basis', DOSE_BASIS);
  const pricePerKg = requirePositive(input.pricePerKg, 'chemical.pricePerKg');
  const activePercent = optional(
    input.activePercent,
    (v) => requirePositive(v, 'chemical.activePercent'),
    100
  );
  const maxDose = optional(input.maxDose, (v) => requirePositive(v, 'chemical.maxDose'), null);
  const codLoad = optional(input.codLoad, (v) => requirePositive(v, 'chemical.codLoad'), 0);

  if (activePercent > 100) {
    throw new FieldError('chemical.activePercent', 'cannot exceed a hundred', activePercent);
  }

  return Object.freeze({
    code,
    name,
    role,
    basis,
    pricePerKg,
    activePercent,
    maxDose,
    codLoad,
    depthDriven: DEPTH_DRIVEN.includes(role),
  });
}

export function createChemicalStore(chemicals = []) {
  const byCode = new Map();
  for (const chemical of chemicals) {
    if (byCode.has(chemical.code)) {
      throw new FieldError('chemical.code', 'appears twice in the store', chemical.code);
    }
    byCode.set(chemical.code, chemical);
  }
  return byCode;
}

export function findChemical(store, code) {
  const chemical = store.get(requireText(code, 'code', { maxLength: 32 }));
  if (!chemical) {
    throw new FieldError('code', 'is not in the chemical store', code);
  }
  return chemical;
}

export function byRole(store, role) {
  requireOneOf(role, 'role', ROLES);
  return [...store.values()].filter((chemical) => chemical.role === role);
}

/**
 * Weight of a chemical for a batch. The basis decides which of the two inputs
 * it reads, and the other one is ignored rather than quietly folded in.
 */
export function chemicalCharge(chemical, dose, { fibreKg, liquorLitres }) {
  requirePositive(dose, 'dose');
  if (chemical.maxDose !== null && dose > chemical.maxDose) {
    throw new FieldError(
      'dose',
      `exceeds the ${chemical.maxDose} ceiling for ${chemical.code}`,
      dose
    );
  }
  if (chemical.basis === 'owf') {
    requirePositive(fibreKg, 'fibreKg');
    return (fibreKg * dose) / 100;
  }
  requirePositive(liquorLitres, 'liquorLitres');
  return (liquorLitres * dose) / 1000;
}

/** The same charge expressed as active substance, which is what the chemistry uses. */
export function activeCharge(chemical, chargeKg) {
  requirePositive(chargeKg, 'chargeKg');
  return (chargeKg * chemical.activePercent) / 100;
}

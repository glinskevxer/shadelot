/**
 * What a batch costs.
 *
 * A commission dyehouse is paid per kilogram of cloth and pays for everything
 * that goes into it, so the interesting number is not the total but the total
 * divided by the cloth that came out saleable. A batch that is dyed twice costs
 * twice and yields once, and the costing has to say so rather than averaging it
 * away across the month.
 */

import { FieldError, requireNonNegative, requirePositive, optional } from '../valid/guards.js';

export const COST_HEADS = Object.freeze([
  'dyestuff',
  'chemical',
  'water',
  'energy',
  'labour',
  'overhead',
]);

export function makeTariff(input) {
  return Object.freeze({
    waterPerCubicMetre: requirePositive(input.waterPerCubicMetre, 'tariff.waterPerCubicMetre'),
    effluentPerCubicMetre: optional(
      input.effluentPerCubicMetre,
      (v) => requireNonNegative(v, 'tariff.effluentPerCubicMetre'),
      0
    ),
    electricityPerKwh: requirePositive(input.electricityPerKwh, 'tariff.electricityPerKwh'),
    steamPerTonne: requirePositive(input.steamPerTonne, 'tariff.steamPerTonne'),
    labourPerHour: requirePositive(input.labourPerHour, 'tariff.labourPerHour'),
    overheadPerMachineHour: optional(
      input.overheadPerMachineHour,
      (v) => requireNonNegative(v, 'tariff.overheadPerMachineHour'),
      0
    ),
  });
}

/** Dyestuff and chemicals straight off the dispensing card. */
export function cardCost(card) {
  const dyestuff = card.lines
    .filter((line) => line.kind === 'dye')
    .reduce((sum, line) => sum + line.kg * line.unitPrice, 0);
  const chemical = card.lines
    .filter((line) => line.kind !== 'dye')
    .reduce((sum, line) => sum + line.kg * line.unitPrice, 0);
  return { dyestuff, chemical };
}

export function utilityCost(tariff, { water, energy }) {
  const cubicMetres = water.net / 1000;
  const waterCost =
    cubicMetres * tariff.waterPerCubicMetre + cubicMetres * tariff.effluentPerCubicMetre;
  const energyCost =
    energy.motorKwh * tariff.electricityPerKwh +
    (energy.steamKgEquivalent / 1000) * tariff.steamPerTonne;
  return { water: waterCost, energy: energyCost };
}

export function labourCost(tariff, { minutes, operators = 1 }) {
  requireNonNegative(minutes, 'minutes');
  requirePositive(operators, 'operators');
  return (tariff.labourPerHour * operators * minutes) / 60;
}

export function overheadCost(tariff, { minutes }) {
  requireNonNegative(minutes, 'minutes');
  return (tariff.overheadPerMachineHour * minutes) / 60;
}

/**
 * The whole batch. Corrections are passed in as their own cards and utility
 * figures so a re-dye shows up as an extra pass rather than a bigger first one.
 */
export function costBatch({ tariff, passes, fibreKg, saleableKg, operators = 1 }) {
  requirePositive(fibreKg, 'fibreKg');
  const saleable = optional(saleableKg, (v) => requireNonNegative(v, 'saleableKg'), fibreKg);
  if (saleable > fibreKg) {
    throw new FieldError('saleableKg', 'cannot exceed what went in', saleable);
  }
  if (!Array.isArray(passes) || passes.length === 0) {
    throw new FieldError('passes', 'must carry at least one pass', passes);
  }

  const heads = Object.fromEntries(COST_HEADS.map((head) => [head, 0]));
  for (const pass of passes) {
    const { dyestuff, chemical } = cardCost(pass.card);
    const { water, energy } = utilityCost(tariff, pass);
    heads.dyestuff += dyestuff;
    heads.chemical += chemical;
    heads.water += water;
    heads.energy += energy;
    heads.labour += labourCost(tariff, { minutes: pass.energy.minutes, operators });
    heads.overhead += overheadCost(tariff, { minutes: pass.energy.minutes });
  }

  const total = COST_HEADS.reduce((sum, head) => sum + heads[head], 0);
  return {
    heads,
    total,
    passes: passes.length,
    perKgCharged: total / fibreKg,
    perKgSaleable: saleable === 0 ? null : total / saleable,
    yield: saleable / fibreKg,
  };
}

/** The share each head took, largest first, which is the only useful ordering. */
export function costShares(costing) {
  return COST_HEADS.map((head) => ({ head, share: costing.heads[head] / costing.total }))
    .filter((row) => row.share > 0)
    .sort((a, b) => b.share - a.share);
}

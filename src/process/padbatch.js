/**
 * Pad batch.
 *
 * Continuous rather than exhaust: the cloth runs through a trough, the mangle
 * squeezes it to a fixed wet pickup, and it is then rolled and left to turn for
 * hours. Almost nothing from the exhaust world applies. There is no liquor
 * ratio, the dose is grams per litre of pad liquor, and the amount on the cloth
 * is set by the pickup rather than by exhaustion.
 *
 * The number that goes wrong is liquor consumption. A trough holds a fixed
 * volume that is thrown away at the end of the run, and on a short run that
 * residue is a large share of the dye bought.
 */

import { FieldError, requireInRange, requirePositive, optional } from '../valid/guards.js';

/** Grams of liquor carried per hundred grams of dry cloth, after the mangle. */
export function wetPickup(clothKg, liquorKg) {
  requirePositive(clothKg, 'clothKg');
  requirePositive(liquorKg, 'liquorKg');
  return (liquorKg / clothKg) * 100;
}

/**
 * The dose in the trough that puts a wanted percentage on the cloth. This is
 * the calculation the whole process turns on and it is one line: at seventy
 * percent pickup a cloth carries 0.7 kg of liquor per kilogram, so the grams
 * per litre needed is the owf divided by the pickup, times a thousand.
 */
export function troughGpl(owf, pickupPercent) {
  requirePositive(owf, 'owf');
  requireInRange(pickupPercent, 'pickupPercent', 20, 150);
  return (owf * 1000) / pickupPercent;
}

export function owfFromTrough(gpl, pickupPercent) {
  requirePositive(gpl, 'gpl');
  requireInRange(pickupPercent, 'pickupPercent', 20, 150);
  return (gpl * pickupPercent) / 1000;
}

/**
 * Liquor for a run. The trough has to be filled before anything moves and the
 * fill is thrown away at the end, so it is charged to the run rather than
 * spread over the metres.
 */
export function liquorForRun({ clothKg, pickupPercent, troughLitres, minimumHeel = 0.6 }) {
  requirePositive(clothKg, 'clothKg');
  requireInRange(pickupPercent, 'pickupPercent', 20, 150);
  requirePositive(troughLitres, 'troughLitres');
  requireInRange(minimumHeel, 'minimumHeel', 0, 1);
  const onCloth = (clothKg * pickupPercent) / 100;
  const residue = troughLitres * minimumHeel;
  const mixed = onCloth + troughLitres;
  return {
    onClothLitres: onCloth,
    troughLitres,
    residueLitres: residue,
    mixedLitres: mixed,
    wasteFraction: residue / mixed,
  };
}

/**
 * The run length below which the trough residue is a bigger share of the dye
 * than the works will accept. Under it, the job belongs on an exhaust machine.
 */
export function minimumEconomicRun({
  pickupPercent,
  troughLitres,
  maximumWaste = 0.15,
  minimumHeel = 0.6,
}) {
  requireInRange(maximumWaste, 'maximumWaste', 0.01, 0.9);
  requireInRange(minimumHeel, 'minimumHeel', 0, 1);
  const residue = troughLitres * minimumHeel;
  const onCloth = residue / maximumWaste - troughLitres;
  if (onCloth <= 0) {
    // The heel is already smaller than the waste the works will accept, so
    // every run length qualifies and there is no minimum to report.
    return 0;
  }
  return (onCloth * 100) / pickupPercent;
}

export const BATCH_TURNS = Object.freeze({ slow: 2, normal: 6, fast: 12 });

/**
 * Whether a roll has turned long enough. Fixation on a cold pad batch is a
 * function of dwell, and stopping it early is the single most common cause of a
 * weak pad batch dyeing.
 */
export function dwellCheck(hoursTurned, { minimumHours = 4, temperature = 25 } = {}) {
  requirePositive(hoursTurned, 'hoursTurned');
  requirePositive(minimumHours, 'minimumHours');
  const required = minimumHours * (temperature >= 30 ? 0.7 : 1);
  return {
    required,
    turned: hoursTurned,
    sufficient: hoursTurned >= required,
    shortBy: Math.max(0, required - hoursTurned),
  };
}

export function turnsFor(speed) {
  const turns = BATCH_TURNS[optional(speed, String, 'normal')];
  if (turns === undefined) {
    throw new FieldError('speed', `must be one of ${Object.keys(BATCH_TURNS).join(', ')}`, speed);
  }
  return turns;
}

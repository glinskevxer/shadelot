/**
 * The dyeing profile.
 *
 * A profile is a list of segments and each one is a ramp, a hold, a dose or a
 * drain. The machine controller reads it as a sequence and so does the costing,
 * which is why the segment carries both a temperature and a duration even when
 * only one of them is doing any work.
 *
 * Ramps are given as a rate rather than a duration, because that is how a dyer
 * writes them and because a controller that cannot hit the rate will stretch the
 * segment rather than skip it.
 */

import {
  FieldError,
  requireInRange,
  requireNonNegative,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const SEGMENT_KINDS = Object.freeze(['ramp', 'hold', 'dose', 'drain', 'fill']);

export const AMBIENT = 20;

export function makeSegment(input) {
  const kind = requireOneOf(input.kind, 'segment.kind', SEGMENT_KINDS);
  const label = requireText(input.label, 'segment.label', { maxLength: 60 });
  const segment = { kind, label };

  if (kind === 'ramp') {
    segment.to = requireInRange(input.to, 'segment.to', 0, 145);
    segment.ratePerMinute = requirePositive(input.ratePerMinute, 'segment.ratePerMinute');
  } else if (kind === 'hold') {
    segment.at = requireInRange(input.at, 'segment.at', 0, 145);
    segment.minutes = requirePositive(input.minutes, 'segment.minutes');
  } else if (kind === 'dose') {
    segment.chemical = requireText(input.chemical, 'segment.chemical', { maxLength: 32 });
    segment.minutes = requirePositive(input.minutes, 'segment.minutes');
    segment.portions = optional(input.portions, (v) => requirePositive(v, 'segment.portions'), 1);
  } else {
    segment.minutes = requirePositive(input.minutes, 'segment.minutes');
    segment.litres = optional(input.litres, (v) => requireNonNegative(v, 'segment.litres'), null);
  }
  return Object.freeze(segment);
}

export function makeProfile(input) {
  const id = requireText(input.id, 'profile.id', { maxLength: 24 });
  const name = requireText(input.name, 'profile.name', { maxLength: 80 });
  const startAt = optional(
    input.startAt,
    (v) => requireInRange(v, 'profile.startAt', 0, 145),
    AMBIENT
  );
  const segments = (input.segments ?? []).map(makeSegment);
  if (segments.length === 0) {
    throw new FieldError('profile.segments', 'must carry at least one segment', 0);
  }
  return Object.freeze({ id, name, startAt, segments: Object.freeze(segments) });
}

/**
 * Walk the profile and say where the bath is at the end of each segment and how
 * long each one took. A ramp downwards is allowed and takes the same rate.
 */
export function walk(profile) {
  let temperature = profile.startAt;
  let elapsed = 0;
  return profile.segments.map((segment) => {
    const from = temperature;
    let minutes;
    if (segment.kind === 'ramp') {
      minutes = Math.abs(segment.to - from) / segment.ratePerMinute;
      temperature = segment.to;
    } else if (segment.kind === 'hold') {
      minutes = segment.minutes;
      temperature = segment.at;
    } else {
      minutes = segment.minutes;
    }
    elapsed += minutes;
    return { label: segment.label, kind: segment.kind, from, to: temperature, minutes, elapsed };
  });
}

export function totalMinutes(profile) {
  const steps = walk(profile);
  return steps.length === 0 ? 0 : steps.at(-1).elapsed;
}

export function peakTemperature(profile) {
  return walk(profile).reduce((peak, step) => Math.max(peak, step.to, step.from), profile.startAt);
}

/** Minutes spent at or above a temperature, which is what fixation depends on. */
export function minutesAtOrAbove(profile, temperature) {
  requireInRange(temperature, 'temperature', 0, 145);
  return walk(profile)
    .filter((step) => step.kind === 'hold' && step.to >= temperature)
    .reduce((sum, step) => sum + step.minutes, 0);
}

/** Whether every segment stays inside what the machine can do. */
export function fitsMachine(profile, machine) {
  const peak = peakTemperature(profile);
  if (peak > machine.maxTemperature) {
    return {
      fits: false,
      reason: `peaks at ${peak} against a machine limit of ${machine.maxTemperature}`,
    };
  }
  return { fits: true, reason: 'ok' };
}

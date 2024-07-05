/**
 * Formatting numbers for a printed sheet.
 *
 * Every number that reaches paper goes through here. The reason is not
 * tidiness: a dispensing weight printed to four places on one card and two on
 * the next is read as a different instruction, and the operator is right to
 * read it that way.
 */

import { FieldError, requireInteger, requireNonNegative, optional } from '../valid/guards.js';

export const NULL_TEXT = '-';

export function decimals(value, places = 2) {
  requireInteger(places, 'places');
  requireNonNegative(places, 'places');
  if (value === null || value === undefined) return NULL_TEXT;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FieldError('value', 'must be a finite number or nothing at all', value);
  }
  return value.toFixed(places);
}

/** A dispensing weight, which is always three places whatever its size. */
export function weight(kg) {
  return decimals(kg, 3);
}

export function percent(fraction, places = 1) {
  if (fraction === null || fraction === undefined) return NULL_TEXT;
  return `${decimals(fraction * 100, places)}%`;
}

export function signed(value, places = 2) {
  if (value === null || value === undefined) return NULL_TEXT;
  const text = decimals(Math.abs(value), places);
  if (Number(text) === 0) return text;
  return value < 0 ? `-${text}` : `+${text}`;
}

export function money(value, { currency = 'GBP', places = 2 } = {}) {
  if (value === null || value === undefined) return NULL_TEXT;
  const symbols = { GBP: '£', EUR: '€', USD: '$' };
  const symbol = symbols[currency];
  if (!symbol) {
    throw new FieldError('currency', `must be one of ${Object.keys(symbols).join(', ')}`, currency);
  }
  return `${symbol}${decimals(value, places)}`;
}

/** Minutes as hours and minutes, which is how a run sheet reads. */
export function duration(minutes) {
  if (minutes === null || minutes === undefined) return NULL_TEXT;
  requireNonNegative(minutes, 'minutes');
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

export function temperature(celsius, places = 0) {
  if (celsius === null || celsius === undefined) return NULL_TEXT;
  return `${decimals(celsius, places)}C`;
}

/** Trim a label to a width, keeping the end when the end is the identifying part. */
export function clip(text, width, { keep = 'start' } = {}) {
  const value = optional(text, String, '');
  requireInteger(width, 'width');
  if (width < 4) {
    throw new FieldError('width', 'must leave room for an ellipsis', width);
  }
  if (value.length <= width) return value;
  if (keep === 'end') return `...${value.slice(value.length - (width - 3))}`;
  return `${value.slice(0, width - 3)}...`;
}

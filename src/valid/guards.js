/**
 * The guards every module reaches for.
 *
 * A dyehouse record arrives from a spreadsheet more often than from a form, so
 * the failure that matters is a silently wrong number rather than a missing
 * one. These throw with the field name in the message because the caller is
 * usually a batch loop and the stack alone will not say which row was bad.
 */

export class FieldError extends RangeError {
  constructor(field, message, value) {
    super(`${field} ${message}, received ${describe(value)}`);
    this.name = 'FieldError';
    this.field = field;
    this.value = value;
  }
}

function describe(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'object') return 'an object';
  return String(value);
}

export function requireNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FieldError(field, 'must be a finite number', value);
  }
  return value;
}

export function requirePositive(value, field) {
  requireNumber(value, field);
  if (value <= 0) {
    throw new FieldError(field, 'must be greater than zero', value);
  }
  return value;
}

export function requireNonNegative(value, field) {
  requireNumber(value, field);
  if (value < 0) {
    throw new FieldError(field, 'must not be negative', value);
  }
  return value;
}

export function requireInRange(value, field, low, high) {
  requireNumber(value, field);
  if (value < low || value > high) {
    throw new FieldError(field, `must lie between ${low} and ${high}`, value);
  }
  return value;
}

export function requireInteger(value, field) {
  requireNumber(value, field);
  if (!Number.isInteger(value)) {
    throw new FieldError(field, 'must be a whole number', value);
  }
  return value;
}

export function requireText(value, field, { maxLength = 120 } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FieldError(field, 'must be a non empty string', value);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new FieldError(field, `must be at most ${maxLength} characters`, trimmed.length);
  }
  return trimmed;
}

export function requireOneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new FieldError(field, `must be one of ${allowed.join(', ')}`, value);
  }
  return value;
}

export function requireArray(value, field, { min = 0 } = {}) {
  if (!Array.isArray(value)) {
    throw new FieldError(field, 'must be an array', value);
  }
  if (value.length < min) {
    throw new FieldError(field, `must hold at least ${min} entries`, value);
  }
  return value;
}

export function optional(value, guard, fallback) {
  return value === undefined || value === null ? fallback : guard(value);
}

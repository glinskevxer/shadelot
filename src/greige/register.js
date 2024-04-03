/**
 * The goods inwards register.
 *
 * Rolls arrive, they are allocated to a lot, and eventually they leave. Nothing
 * here deletes: a roll that turns out to be somebody else's is returned, and the
 * return is a movement like any other, because a customer asking where their
 * cloth went is asking about a history and not about a current state.
 */

import { FieldError, requireArray, requireText } from '../valid/guards.js';

export const STATES = ['received', 'allocated', 'in-process', 'dyed', 'shipped', 'returned'];

const ALLOWED = Object.freeze({
  received: ['allocated', 'returned'],
  allocated: ['in-process', 'received', 'returned'],
  'in-process': ['dyed', 'allocated'],
  dyed: ['shipped', 'in-process'],
  shipped: [],
  returned: [],
});

export function nextStates(state) {
  const onward = ALLOWED[state];
  if (onward === undefined) {
    throw new FieldError('state', `must be one of ${STATES.join(', ')}`, state);
  }
  return [...onward];
}

export function createRegister() {
  return { rolls: new Map(), movements: [] };
}

export function receive(register, roll, { at, note } = {}) {
  if (register.rolls.has(roll.id)) {
    throw new FieldError('roll.id', 'is already on the register', roll.id);
  }
  const entry = { roll, state: 'received', lotId: null, at: at ?? null };
  register.rolls.set(roll.id, entry);
  register.movements.push({
    rollId: roll.id,
    from: null,
    to: 'received',
    at: at ?? null,
    note: note ?? null,
  });
  return entry;
}

export function lookup(register, rollId) {
  const entry = register.rolls.get(requireText(rollId, 'rollId', { maxLength: 24 }));
  if (!entry) {
    throw new FieldError('rollId', 'is not on the register', rollId);
  }
  return entry;
}

export function moveTo(register, rollId, state, { at, note, lotId } = {}) {
  const entry = lookup(register, rollId);
  if (!nextStates(entry.state).includes(state)) {
    throw new FieldError(
      'state',
      `cannot go from ${entry.state} to ${state}, only to ${nextStates(entry.state).join(', ') || 'nowhere'}`,
      state
    );
  }
  register.movements.push({
    rollId,
    from: entry.state,
    to: state,
    at: at ?? null,
    note: note ?? null,
  });
  entry.state = state;
  if (lotId !== undefined) entry.lotId = lotId;
  if (state === 'received') entry.lotId = null;
  return entry;
}

export function allocate(register, rollIds, lotId, options = {}) {
  requireArray(rollIds, 'rollIds', { min: 1 });
  requireText(lotId, 'lotId', { maxLength: 24 });
  return rollIds.map((rollId) => moveTo(register, rollId, 'allocated', { ...options, lotId }));
}

export function inState(register, state) {
  if (!STATES.includes(state)) {
    throw new FieldError('state', `must be one of ${STATES.join(', ')}`, state);
  }
  return [...register.rolls.values()].filter((entry) => entry.state === state);
}

export function historyOf(register, rollId) {
  lookup(register, rollId);
  return register.movements.filter((movement) => movement.rollId === rollId);
}

/** Total mass sitting in a state, which is what the floor plan is drawn against. */
export function massInState(register, state) {
  return inState(register, state).reduce((sum, entry) => sum + entry.roll.mass, 0);
}

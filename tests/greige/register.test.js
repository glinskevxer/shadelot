import { beforeEach, describe, expect, it } from 'vitest';
import { makeRoll } from '../../src/greige/roll.js';
import {
  STATES,
  allocate,
  createRegister,
  historyOf,
  inState,
  lookup,
  massInState,
  moveTo,
  nextStates,
  receive,
} from '../../src/greige/register.js';

const template = {
  quality: 'combed poplin 40s',
  construction: 'woven',
  blend: { cotton: 100 },
  length: 100,
  widthCm: 150,
  gsm: 200,
};

const roll = (id) => makeRoll({ ...template, id });

describe('the state machine', () => {
  it('names every state a roll can be in', () => {
    expect(STATES).toEqual(['received', 'allocated', 'in-process', 'dyed', 'shipped', 'returned']);
  });

  it('lets a roll come back off a lot but not out of the shipping bay', () => {
    expect(nextStates('allocated')).toContain('received');
    expect(nextStates('shipped')).toEqual([]);
  });

  it('refuses to answer for a state nothing uses', () => {
    expect(() => nextStates('scrapped')).toThrow(/must be one of received/);
  });
});

describe('receiving', () => {
  let register;
  beforeEach(() => {
    register = createRegister();
  });

  it('puts a roll on the register in the received state', () => {
    const entry = receive(register, roll('A'), { at: '2025-02-04' });
    expect(entry.state).toBe('received');
    expect(entry.lotId).toBeNull();
    expect(register.movements).toHaveLength(1);
  });

  it('refuses the same roll number twice', () => {
    receive(register, roll('A'));
    expect(() => receive(register, roll('A'))).toThrow(/already on the register/);
  });

  it('says so plainly when a roll is not there', () => {
    expect(() => lookup(register, 'Z')).toThrow(/is not on the register/);
  });
});

describe('moving a roll along', () => {
  let register;
  beforeEach(() => {
    register = createRegister();
    ['A', 'B', 'C'].forEach((id) => receive(register, roll(id)));
  });

  it('allocates a set of rolls to a lot in one call', () => {
    allocate(register, ['A', 'B'], 'G25-00007');
    expect(lookup(register, 'A').lotId).toBe('G25-00007');
    expect(inState(register, 'allocated')).toHaveLength(2);
    expect(inState(register, 'received')).toHaveLength(1);
  });

  it('refuses a jump the floor cannot make, and says where it could go', () => {
    expect(() => moveTo(register, 'A', 'dyed')).toThrow(/cannot go from received to dyed/);
    expect(() => moveTo(register, 'A', 'dyed')).toThrow(/only to allocated, returned/);
  });

  it('clears the lot when a roll comes back off it', () => {
    allocate(register, ['A'], 'G25-00007');
    moveTo(register, 'A', 'received');
    expect(lookup(register, 'A').lotId).toBeNull();
  });

  it('keeps every movement rather than the last one', () => {
    allocate(register, ['A'], 'G25-00007');
    moveTo(register, 'A', 'in-process');
    moveTo(register, 'A', 'dyed');
    const history = historyOf(register, 'A');
    expect(history.map((m) => m.to)).toEqual(['received', 'allocated', 'in-process', 'dyed']);
    expect(history[1].from).toBe('received');
  });

  it('carries a note onto the movement when one is given', () => {
    moveTo(register, 'A', 'returned', { note: 'wrong customer' });
    expect(historyOf(register, 'A').at(-1).note).toBe('wrong customer');
  });

  it('will not allocate an empty list or to an unnamed lot', () => {
    expect(() => allocate(register, [], 'G25-1')).toThrow(/rollIds/);
    expect(() => allocate(register, ['A'], '')).toThrow(/lotId/);
  });
});

describe('what is where', () => {
  it('totals the mass sitting in a state', () => {
    const register = createRegister();
    ['A', 'B'].forEach((id) => receive(register, roll(id)));
    expect(massInState(register, 'received')).toBeCloseTo(60, 9);
    allocate(register, ['A'], 'G25-1');
    expect(massInState(register, 'received')).toBeCloseTo(30, 9);
    expect(massInState(register, 'allocated')).toBeCloseTo(30, 9);
  });

  it('refuses to count a state that does not exist', () => {
    expect(() => inState(createRegister(), 'lost')).toThrow(/must be one of/);
  });
});

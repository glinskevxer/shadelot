import { describe, expect, it } from 'vitest';
import {
  RULES,
  checkPacking,
  makeInstruction,
  pack,
  packingNote,
} from '../../src/order/despatch.js';

const roll = (id, shade, metres = 100, kg = 21) => ({ id, shade, metres, kg });

const rolls = [
  roll('R1', 'olive 4488'),
  roll('R2', 'olive 4488'),
  roll('R3', 'olive 4488'),
  roll('R4', 'navy 118'),
  roll('R5', 'navy 118'),
];

describe('an instruction', () => {
  it('names the four rules the customers ask for', () => {
    expect(RULES).toEqual([
      'one-shade-per-bale',
      'fixed-metres',
      'machine-order',
      'fill-to-weight',
    ]);
  });

  it('defaults to eight rolls a bale', () => {
    expect(makeInstruction({ rule: 'machine-order', customer: 'K' }).maxRollsPerBale).toBe(8);
  });

  it('needs the metreage for a fixed metres rule', () => {
    expect(() => makeInstruction({ rule: 'fixed-metres', customer: 'K' })).toThrow(/metresPerBale/);
  });

  it('needs the weight for a fill to weight rule', () => {
    expect(() => makeInstruction({ rule: 'fill-to-weight', customer: 'K' })).toThrow(/kgPerBale/);
  });

  it('refuses a rule nobody asked for', () => {
    expect(() => makeInstruction({ rule: 'alphabetical', customer: 'K' })).toThrow(
      /instruction.rule/
    );
  });
});

describe('one shade per bale', () => {
  const instruction = makeInstruction({ rule: 'one-shade-per-bale', customer: 'Kestrel' });

  it('closes a bale when the shade changes', () => {
    const bales = pack(rolls, instruction);
    expect(bales).toHaveLength(2);
    expect(bales[0].shades).toEqual(['olive 4488']);
    expect(bales[1].shades).toEqual(['navy 118']);
  });

  it('holds the rolls in the order they came', () => {
    expect(pack(rolls, instruction)[0].rolls).toEqual(['R1', 'R2', 'R3']);
  });

  it('opens a fresh bale for a shade that comes back later', () => {
    const mixed = [...rolls, roll('R6', 'olive 4488')];
    expect(pack(mixed, instruction)).toHaveLength(3);
  });

  it('passes its own check', () => {
    expect(checkPacking(pack(rolls, instruction), instruction).ok).toBe(true);
  });
});

describe('fixed metres', () => {
  const instruction = makeInstruction({
    rule: 'fixed-metres',
    customer: 'Marlow',
    metresPerBale: 250,
  });

  it('never puts more than the metreage in a bale', () => {
    const bales = pack(rolls, instruction);
    for (const bale of bales) {
      expect(bale.metres).toBeLessThanOrEqual(250);
    }
  });

  it('fills each bale before opening the next', () => {
    expect(pack(rolls, instruction)[0].rollCount).toBe(2);
  });

  it('takes a roll longer than the bale on its own', () => {
    const long = [roll('R1', 'olive', 400, 84)];
    const bales = pack(long, instruction);
    expect(bales).toHaveLength(1);
    expect(checkPacking(bales, instruction).ok).toBe(false);
  });

  it('does not care about the shade', () => {
    expect(pack(rolls, instruction)[0].shades).toHaveLength(1);
    expect(pack([roll('A', 'x'), roll('B', 'y')], instruction)[0].shades).toHaveLength(2);
  });
});

describe('fill to weight', () => {
  const instruction = makeInstruction({
    rule: 'fill-to-weight',
    customer: 'Redgate',
    kgPerBale: 50,
  });

  it('never puts more than the weight in a bale', () => {
    for (const bale of pack(rolls, instruction)) {
      expect(bale.kg).toBeLessThanOrEqual(50);
    }
  });

  it('makes more bales than the metres rule would on heavy cloth', () => {
    const heavy = rolls.map((entry) => ({ ...entry, kg: 40 }));
    expect(pack(heavy, instruction).length).toBeGreaterThan(2);
  });
});

describe('machine order', () => {
  const instruction = makeInstruction({
    rule: 'machine-order',
    customer: 'Kestrel',
    maxRollsPerBale: 2,
  });

  it('keeps the order and only breaks on the roll count', () => {
    const bales = pack(rolls, instruction);
    expect(bales.map((bale) => bale.rolls)).toEqual([['R1', 'R2'], ['R3', 'R4'], ['R5']]);
  });

  it('mixes shades, which is the point of the rule', () => {
    expect(pack(rolls, instruction)[1].shades).toHaveLength(2);
  });
});

describe('checking a packing', () => {
  it('names every bale that breaks the instruction', () => {
    const instruction = makeInstruction({ rule: 'one-shade-per-bale', customer: 'K' });
    const badly = [
      {
        number: 1,
        rolls: ['R1', 'R4'],
        rollCount: 2,
        metres: 200,
        kg: 42,
        shades: ['navy 118', 'olive 4488'],
      },
    ];
    const result = checkPacking(badly, instruction);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/mixes navy 118 and olive 4488/);
  });

  it('catches an overfull bale whatever the rule', () => {
    const instruction = makeInstruction({
      rule: 'machine-order',
      customer: 'K',
      maxRollsPerBale: 2,
    });
    const badly = [
      { number: 1, rolls: ['A', 'B', 'C'], rollCount: 3, metres: 300, kg: 63, shades: ['x'] },
    ];
    expect(checkPacking(badly, instruction).problems[0]).toMatch(/holds 3 rolls/);
  });
});

describe('the packing note', () => {
  it('totals the lorry', () => {
    const instruction = makeInstruction({ rule: 'one-shade-per-bale', customer: 'Kestrel' });
    const note = packingNote(pack(rolls, instruction), { order: 'O25-0900', at: '2025-05-14' });
    expect(note.bales).toBe(2);
    expect(note.rolls).toBe(5);
    expect(note.metres).toBe(500);
    expect(note.shades).toEqual(['navy 118', 'olive 4488']);
  });

  it('refuses a lorry with nothing on it', () => {
    expect(() => packingNote([], { order: 'O25-0900' })).toThrow(/nothing to despatch/);
  });

  it('needs an order against it', () => {
    expect(() =>
      packingNote([{ number: 1, rollCount: 1, metres: 1, kg: 1, shades: [] }], {})
    ).toThrow(/order/);
  });
});

describe('packing nothing', () => {
  it('is refused rather than returning an empty list', () => {
    const instruction = makeInstruction({ rule: 'machine-order', customer: 'K' });
    expect(() => pack([], instruction)).toThrow(/at least 1 entries/);
  });

  it('refuses a roll with no length or weight', () => {
    const instruction = makeInstruction({ rule: 'machine-order', customer: 'K' });
    expect(() => pack([{ id: 'R1', shade: 'x', kg: 20 }], instruction)).toThrow(/roll.metres/);
    expect(() => pack([{ id: 'R1', shade: 'x', metres: 100 }], instruction)).toThrow(/roll.kg/);
  });
});

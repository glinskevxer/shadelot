/**
 * Properties of the planning.
 *
 * Sequencing, stock and availability all have invariants that no example test
 * will find a hole in, because the hole is in a combination nobody thought to
 * write down: a sequence that loses a batch, an issue that draws more than it
 * takes off the lots, a calendar that reports free hours it does not have.
 */

import { describe, expect, it } from 'vitest';
import { changeover, dayLoad, sequenceCost, sequenceDay } from '../../src/schedule/sequence.js';
import { createStock, issue, onHand, receiveLot, valueOnHand } from '../../src/inventory/stock.js';
import { availabilityOn, commit, makeCalendar } from '../../src/machine/availability.js';
import { pack, checkPacking, makeInstruction } from '../../src/order/despatch.js';
import { changeoverCost } from '../../src/machine/changeover.js';
import { makeMachine } from '../../src/machine/register.js';
import { between, generator, pick } from '../support/random.js';

const batchesFor = (random, count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `B${i}`,
    depth: between(random, 0.05, 8),
    dyeClass: pick(random, ['reactive', 'disperse', 'acid']),
    runMinutes: between(random, 60, 400),
  }));

describe('sequencing', () => {
  it('never loses or duplicates a batch', () => {
    const random = generator(101);
    for (let i = 0; i < 200; i += 1) {
      const batches = batchesFor(random, 1 + Math.floor(random() * 12));
      const ordered = sequenceDay(batches);
      expect(ordered).toHaveLength(batches.length);
      expect(new Set(ordered.map((batch) => batch.id)).size).toBe(batches.length);
    }
  });

  it('keeps every dye class in one run', () => {
    const random = generator(102);
    for (let i = 0; i < 200; i += 1) {
      const ordered = sequenceDay(batchesFor(random, 2 + Math.floor(random() * 10)));
      const classes = ordered.map((batch) => batch.dyeClass);
      for (const dyeClass of new Set(classes)) {
        const first = classes.indexOf(dyeClass);
        const last = classes.lastIndexOf(dyeClass);
        expect(classes.slice(first, last + 1).every((entry) => entry === dyeClass)).toBe(true);
      }
    }
  });

  it('never costs less than the running time alone', () => {
    const random = generator(103);
    for (let i = 0; i < 200; i += 1) {
      const batches = batchesFor(random, 1 + Math.floor(random() * 10));
      const running = batches.reduce((sum, batch) => sum + batch.runMinutes, 0);
      expect(sequenceCost(sequenceDay(batches)).minutes).toBeGreaterThanOrEqual(running);
    }
  });

  it('never charges a cleaning for going darker inside one class', () => {
    const random = generator(104);
    for (let i = 0; i < 300; i += 1) {
      const lighter = { id: 'A', depth: between(random, 0.1, 4), dyeClass: 'reactive' };
      const darker = {
        id: 'B',
        depth: lighter.depth + between(random, 0, 4),
        dyeClass: 'reactive',
      };
      expect(changeover(lighter, darker).minutes).toBe(0);
    }
  });

  it('reports a day load no shorter than the sequence it costed', () => {
    const random = generator(105);
    for (let i = 0; i < 100; i += 1) {
      const batches = batchesFor(random, 1 + Math.floor(random() * 8));
      const load = dayLoad(batches, { hoursAvailable: 24 });
      expect(load.hours * 60).toBeCloseTo(sequenceCost(sequenceDay(batches)).minutes, 6);
    }
  });
});

describe('cleaning costs', () => {
  const jet = makeMachine({
    id: 'JET-4',
    type: 'jet',
    minLoadKg: 60,
    maxLoadKg: 300,
    deadVolumeLitres: 900,
    litresPerKg: 3.5,
  });

  it('never charge water or heat for no cleaning', () => {
    expect(changeoverCost('none', jet).litres).toBe(0);
    expect(changeoverCost('none', jet).heatKj).toBe(0);
  });

  it('rise with the cleaning', () => {
    const kinds = ['none', 'rinse', 'boil', 'strip'];
    for (let i = 1; i < kinds.length; i += 1) {
      expect(changeoverCost(kinds[i], jet).litres).toBeGreaterThanOrEqual(
        changeoverCost(kinds[i - 1], jet).litres
      );
    }
  });
});

describe('stock', () => {
  it('never draws more than it takes off the lots', () => {
    const random = generator(201);
    for (let i = 0; i < 200; i += 1) {
      const stock = createStock();
      const lots = 1 + Math.floor(random() * 4);
      let total = 0;
      for (let lot = 0; lot < lots; lot += 1) {
        const quantity = between(random, 1, 50);
        total += quantity;
        receiveLot(stock, {
          lotId: `L${lot}`,
          code: 'X',
          quantityKg: quantity,
          pricePerKg: between(random, 1, 40),
        });
      }
      const wanted = between(random, 0.01, total);
      const drawn = issue(stock, 'X', wanted);
      const taken = drawn.drawn.reduce((sum, line) => sum + line.kg, 0);
      expect(taken).toBeCloseTo(wanted, 6);
      expect(onHand(stock, 'X')).toBeCloseTo(total - wanted, 6);
    }
  });

  it('never leaves a lot negative or over its receipt', () => {
    const random = generator(202);
    const stock = createStock();
    for (let lot = 0; lot < 6; lot += 1) {
      receiveLot(stock, { lotId: `L${lot}`, code: 'X', quantityKg: 20, pricePerKg: 10 });
    }
    for (let i = 0; i < 40; i += 1) {
      const available = onHand(stock, 'X');
      if (available < 0.5) break;
      issue(stock, 'X', between(random, 0.1, available));
      for (const lot of stock.lots) {
        expect(lot.remainingKg).toBeGreaterThanOrEqual(-1e-9);
        expect(lot.remainingKg).toBeLessThanOrEqual(lot.quantityKg + 1e-9);
      }
    }
    expect(valueOnHand(stock, 'X')).toBeGreaterThanOrEqual(0);
  });
});

describe('availability', () => {
  it('never reports more free hours than the shift gives', () => {
    const random = generator(301);
    for (let i = 0; i < 200; i += 1) {
      const calendar = makeCalendar({
        machineId: 'JET-4',
        pattern: pick(random, ['single', 'double', 'continental', 'continuous']),
      });
      const day = '2025-05-06';
      const commitments = Math.floor(random() * 4);
      for (let c = 0; c < commitments; c += 1) {
        commit(calendar, { batchId: `B${c}`, day, hours: between(random, 0.5, 6) });
      }
      const row = availabilityOn(calendar, day);
      expect(row.free).toBeLessThanOrEqual(row.nominal);
      expect(row.free).toBeGreaterThanOrEqual(0);
      expect(row.overcommitted).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('packing', () => {
  it('always packs every roll exactly once and passes its own check', () => {
    const random = generator(401);
    const rules = ['one-shade-per-bale', 'machine-order'];
    for (let i = 0; i < 200; i += 1) {
      const rolls = Array.from({ length: 1 + Math.floor(random() * 12) }, (_, index) => ({
        id: `R${index}`,
        shade: pick(random, ['olive', 'navy', 'sage']),
        metres: between(random, 10, 400),
        kg: between(random, 2, 90),
      }));
      const instruction = makeInstruction({
        rule: pick(random, rules),
        customer: 'K',
        maxRollsPerBale: 1 + Math.floor(random() * 6),
      });
      const bales = pack(rolls, instruction);
      const packed = bales.flatMap((bale) => bale.rolls);
      expect(packed).toHaveLength(rolls.length);
      expect(new Set(packed).size).toBe(rolls.length);
      expect(checkPacking(bales, instruction).ok).toBe(true);
    }
  });
});

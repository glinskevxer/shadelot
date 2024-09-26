import { beforeEach, describe, expect, it } from 'vitest';
import {
  ORDER_STATES,
  cancel,
  ceilingMetres,
  deliver,
  deliveredMetres,
  dueBy,
  makeOrder,
  outstandingMetres,
  progress,
  requireState,
} from '../../src/order/order.js';

const base = {
  id: 'O25-0900',
  customer: 'Kestrel Apparel',
  quality: 'cotton poplin 140gsm',
  shade: 'olive 4488',
  metres: 1000,
  dueAt: '2025-05-16',
};

describe('taking an order', () => {
  it('starts open with nothing delivered', () => {
    const order = makeOrder(base);
    expect(order.state).toBe('open');
    expect(deliveredMetres(order)).toBe(0);
    expect(outstandingMetres(order)).toBe(1000);
  });

  it('defaults the over delivery tolerance to three percent', () => {
    expect(ceilingMetres(makeOrder(base))).toBeCloseTo(1030, 9);
    expect(ceilingMetres(makeOrder({ ...base, tolerancePercent: 10 }))).toBeCloseTo(1100, 9);
  });

  it('needs every field a delivery note carries', () => {
    expect(() => makeOrder({ ...base, customer: '' })).toThrow(/order.customer/);
    expect(() => makeOrder({ ...base, metres: 0 })).toThrow(/order.metres/);
    expect(() => makeOrder({ ...base, dueAt: '' })).toThrow(/order.dueAt/);
  });
});

describe('delivering against it', () => {
  let order;
  beforeEach(() => {
    order = makeOrder(base);
  });

  it('moves to part delivered on the first batch', () => {
    deliver(order, { batchId: 'B1', metres: 400 });
    expect(order.state).toBe('part-delivered');
    expect(outstandingMetres(order)).toBe(600);
  });

  it('completes once the ordered metres are met', () => {
    deliver(order, { batchId: 'B1', metres: 400 });
    deliver(order, { batchId: 'B2', metres: 620 });
    expect(order.state).toBe('delivered');
    expect(outstandingMetres(order)).toBe(0);
  });

  it('takes a delivery inside the over tolerance', () => {
    deliver(order, { batchId: 'B1', metres: 1025 });
    expect(order.state).toBe('delivered');
  });

  it('refuses one past the ceiling and says what the ceiling is', () => {
    expect(() => deliver(order, { batchId: 'B1', metres: 1100 })).toThrow(
      /against a ceiling of 1030.0/
    );
  });

  it('counts the deliveries already made towards the ceiling', () => {
    deliver(order, { batchId: 'B1', metres: 900 });
    expect(() => deliver(order, { batchId: 'B2', metres: 200 })).toThrow(/ceiling/);
  });

  it('takes no more deliveries once complete', () => {
    deliver(order, { batchId: 'B1', metres: 1000 });
    expect(() => deliver(order, { batchId: 'B2', metres: 10 })).toThrow(/is complete/);
  });

  it('keeps the batch behind each delivery', () => {
    deliver(order, { batchId: 'B25-00301', metres: 400, at: '2025-05-02' });
    expect(order.deliveries[0]).toEqual({
      batchId: 'B25-00301',
      metres: 400,
      at: '2025-05-02',
      note: null,
    });
  });

  it('refuses a delivery with no batch behind it', () => {
    expect(() => deliver(order, { metres: 100 })).toThrow(/delivery.batchId/);
  });
});

describe('cancelling', () => {
  it('takes no further deliveries', () => {
    const order = makeOrder(base);
    cancel(order, 'the customer pulled the range');
    expect(order.state).toBe('cancelled');
    expect(() => deliver(order, { batchId: 'B1', metres: 10 })).toThrow(/is cancelled/);
  });

  it('cannot cancel something already shipped', () => {
    const order = makeOrder(base);
    deliver(order, { batchId: 'B1', metres: 1000 });
    expect(() => cancel(order, 'too late')).toThrow(/is complete/);
  });

  it('needs a reason', () => {
    expect(() => cancel(makeOrder(base), '')).toThrow(/reason/);
  });
});

describe('what is due', () => {
  const orders = [
    makeOrder({ ...base, id: 'O1', dueAt: '2025-05-01' }),
    makeOrder({ ...base, id: 'O2', dueAt: '2025-06-01' }),
    makeOrder({ ...base, id: 'O3', dueAt: '2025-04-20' }),
  ];

  it('lists the soonest first', () => {
    expect(dueBy(orders, '2025-05-16').map((order) => order.id)).toEqual(['O3', 'O1']);
  });

  it('leaves out anything already complete or cancelled', () => {
    const done = makeOrder({ ...base, id: 'O4', dueAt: '2025-04-01' });
    deliver(done, { batchId: 'B1', metres: 1000 });
    expect(dueBy([...orders, done], '2025-05-16').map((order) => order.id)).not.toContain('O4');
  });

  it('refuses a state nothing sets', () => {
    expect(requireState('open')).toBe('open');
    expect(() => requireState('shipped')).toThrow(/state/);
    expect(ORDER_STATES).toHaveLength(4);
  });
});

describe('progress', () => {
  it('never reports more than complete even on an over delivery', () => {
    const order = makeOrder(base);
    deliver(order, { batchId: 'B1', metres: 1025 });
    expect(progress(order).fraction).toBe(1);
    expect(progress(order).delivered).toBe(1025);
  });

  it('counts the batches it took', () => {
    const order = makeOrder(base);
    deliver(order, { batchId: 'B1', metres: 400 });
    deliver(order, { batchId: 'B2', metres: 300 });
    expect(progress(order).batches).toBe(2);
    expect(progress(order).fraction).toBeCloseTo(0.7, 9);
  });
});

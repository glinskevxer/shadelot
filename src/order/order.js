/**
 * Customer orders.
 *
 * An order is taken in finished metres against a delivery date and is filled by
 * batches. It is not filled by one batch, which is why the delivery is tracked
 * against a running total and why a part delivery is a first class thing rather
 * than an exception.
 *
 * Over delivery is refused. A customer who ordered a thousand metres does not
 * want eleven hundred and will not pay for the extra hundred.
 */

import {
  FieldError,
  requireArray,
  requireOneOf,
  requirePositive,
  requireText,
  optional,
} from '../valid/guards.js';

export const ORDER_STATES = ['open', 'part-delivered', 'delivered', 'cancelled'];

export function makeOrder(input) {
  const id = requireText(input.id, 'order.id', { maxLength: 24 });
  const customer = requireText(input.customer, 'order.customer', { maxLength: 80 });
  const quality = requireText(input.quality, 'order.quality', { maxLength: 60 });
  const shade = requireText(input.shade, 'order.shade', { maxLength: 60 });
  const metres = requirePositive(input.metres, 'order.metres');
  const dueAt = requireText(input.dueAt, 'order.dueAt', { maxLength: 32 });
  const tolerancePercent = optional(
    input.tolerancePercent,
    (v) => requirePositive(v, 'order.tolerancePercent'),
    3
  );
  return {
    id,
    customer,
    quality,
    shade,
    metres,
    dueAt,
    tolerancePercent,
    state: 'open',
    deliveries: [],
  };
}

export function deliveredMetres(order) {
  return order.deliveries.reduce((sum, delivery) => sum + delivery.metres, 0);
}

export function outstandingMetres(order) {
  return Math.max(0, order.metres - deliveredMetres(order));
}

/** The most that may still be delivered, which is the order plus its tolerance. */
export function ceilingMetres(order) {
  return order.metres * (1 + order.tolerancePercent / 100);
}

export function deliver(order, delivery) {
  if (order.state === 'cancelled') {
    throw new FieldError('order.state', 'is cancelled and takes no deliveries', order.state);
  }
  if (order.state === 'delivered') {
    throw new FieldError('order.state', 'is complete and takes no further deliveries', order.state);
  }
  const metres = requirePositive(delivery.metres, 'delivery.metres');
  const batchId = requireText(delivery.batchId, 'delivery.batchId', { maxLength: 24 });
  const after = deliveredMetres(order) + metres;
  if (after > ceilingMetres(order)) {
    throw new FieldError(
      'delivery.metres',
      `would take the order to ${after.toFixed(1)} metres against a ceiling of ${ceilingMetres(order).toFixed(1)}`,
      metres
    );
  }
  const record = Object.freeze({
    batchId,
    metres,
    at: optional(delivery.at, (v) => requireText(v, 'delivery.at'), null),
    note: optional(delivery.note, (v) => requireText(v, 'delivery.note', { maxLength: 200 }), null),
  });
  order.deliveries.push(record);
  order.state = deliveredMetres(order) >= order.metres ? 'delivered' : 'part-delivered';
  return record;
}

export function cancel(order, reason) {
  if (order.state === 'delivered') {
    throw new FieldError('order.state', 'is complete and cannot be cancelled', order.state);
  }
  order.state = 'cancelled';
  order.cancelledBecause = requireText(reason, 'reason', { maxLength: 200 });
  return order;
}

/** Orders due on or before a date and not yet complete, soonest first. */
export function dueBy(orders, date) {
  requireArray(orders, 'orders');
  requireText(date, 'date', { maxLength: 32 });
  return orders
    .filter((order) => order.state === 'open' || order.state === 'part-delivered')
    .filter((order) => order.dueAt <= date)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
}

export function requireState(value) {
  return requireOneOf(value, 'state', ORDER_STATES);
}

/** How complete an order is, which is what a progress board shows. */
export function progress(order) {
  return {
    id: order.id,
    ordered: order.metres,
    delivered: deliveredMetres(order),
    outstanding: outstandingMetres(order),
    fraction: Math.min(1, deliveredMetres(order) / order.metres),
    state: order.state,
    batches: order.deliveries.length,
  };
}

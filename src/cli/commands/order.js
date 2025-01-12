/**
 * The order command.
 *
 * Reads an order and the batches delivered against it, and says what is left.
 * It also judges each batch against the standard and against the first accepted
 * one, so an order that is on shade against the customer standard and drifting
 * batch to batch shows up here rather than in a complaint.
 */

import {
  makeOrder as makeContinuityOrder,
  recordBatch,
  rejectedBatches,
  shadeBand,
} from '../../shade/continuity.js';
import { deliver, makeOrder, progress } from '../../order/order.js';
import { makeTolerance } from '../../colour/tolerance.js';
import { percent, signed } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { CommandError, dataError } from '../exit.js';
import { readObject } from '../io.js';
import { toReading } from '../readings.js';
import { loadWorks, toleranceNamed } from '../works.js';

const COLUMNS = [
  { key: 'batchId', heading: 'batch' },
  { key: 'metres', heading: 'metres', align: 'right', format: (v) => v.toFixed(0) },
  { key: 'againstStandard', heading: 'to standard', align: 'right', format: (v) => v.toFixed(3) },
  {
    key: 'againstReference',
    heading: 'to first',
    align: 'right',
    format: (v) => (v === null ? '-' : v.toFixed(3)),
  },
  { key: 'state', heading: 'state' },
];

export function registerOrderCommand(program, { out }) {
  program
    .command('order')
    .description('show what is left on an order and whether the batches hold together')
    .requiredOption('-o, --order <path>', 'the order file')
    .option('-w, --works <path>', 'the works file, for its named tolerance blocks')
    .option('-t, --tolerance <name>', 'the tolerance block to judge under')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const document = await readObject(options.order, { what: 'order file' });
      const block = options.tolerance
        ? toleranceNamed(await loadWorks(requireWorks(options)), options.tolerance)
        : makeTolerance({ name: 'works default', formula: 'cmc', total: 1 });

      const order = makeOrder({
        id: document.id,
        customer: document.customer,
        quality: document.quality,
        shade: document.shade,
        metres: document.metres,
        dueAt: document.dueAt,
        tolerancePercent: document.tolerancePercent,
      });
      const continuity = makeContinuityOrder({
        id: document.id,
        customer: document.customer,
        standard: toReading(document.standard, 'order standard'),
        tolerance: block,
        continuityLimit: document.continuityLimit,
      });

      const deliveries = Array.isArray(document.deliveries) ? document.deliveries : [];
      const rows = deliveries.map((delivery, index) => {
        if (!delivery.batchId) {
          throw dataError(`delivery ${index} in the order file has no batch against it`);
        }
        const recorded = recordBatch(continuity, {
          batchId: delivery.batchId,
          reading: toReading(delivery.reading, `delivery ${index} reading`),
        });
        if (recorded.accepted) {
          deliver(order, { batchId: delivery.batchId, metres: delivery.metres, at: delivery.at });
        }
        return {
          batchId: delivery.batchId,
          metres: delivery.metres,
          againstStandard: recorded.againstStandard,
          againstReference: recorded.againstReference,
          state: recorded.accepted
            ? 'accepted'
            : recorded.withinStandard
              ? 'off the run'
              : 'off shade',
        };
      });

      const status = progress(order);
      const band = continuity.batches.some((batch) => batch.accepted)
        ? shadeBand(continuity)
        : null;

      if (options.format === 'json') {
        out.write(JSON.stringify({ ...status, deliveries: rows, band }, null, 2));
      } else {
        out.write(render(options.format, COLUMNS, rows));
        out.write('');
        out.write(
          renderRecord([
            ['order', `${order.id}  ${order.customer}`],
            ['shade', order.shade],
            ['due', order.dueAt],
            ['ordered', `${status.ordered} m`],
            ['delivered', `${status.delivered} m over ${status.batches} batches`],
            ['outstanding', `${status.outstanding} m`],
            ['complete', percent(status.fraction)],
            [
              'shade band',
              band ? `${signed(band.widest, 3)} at its widest` : 'nothing accepted yet',
            ],
            ['state', order.state],
          ])
        );
      }

      const rejected = rejectedBatches(continuity);
      if (rejected.length > 0) {
        throw new CommandError(
          `${rejected.length} batch(es) did not hold: ${rejected.map((batch) => batch.batchId).join(', ')}`,
          'outOfTolerance'
        );
      }
    });
}

function requireWorks(options) {
  if (!options.works) {
    throw dataError('a named tolerance needs the works file it lives in');
  }
  return options.works;
}

/**
 * The stock command.
 *
 * Three things in one command because they are one question on the floor: what
 * is on hand, what can this card be dispensed from, and what needs ordering. It
 * never writes anything, so it can be run from a phone in the store without any
 * risk of moving a number.
 */

import {
  belowReorder,
  createStock,
  lotsFor,
  onHand,
  receiveLot,
  valueOnHand,
} from '../../inventory/stock.js';
import { money, weight } from '../../report/format.js';
import { respond } from '../report.js';
import { CommandError, dataError } from '../exit.js';
import { readObject, readRows } from '../io.js';

const LOT_COLUMNS = [
  { key: 'lotId', heading: 'lot' },
  { key: 'code', heading: 'article' },
  { key: 'remainingKg', heading: 'on hand', align: 'right', format: weight },
  { key: 'pricePerKg', heading: 'price', align: 'right', format: (v) => money(v) },
  { key: 'strength', heading: 'strength', align: 'right', format: (v) => v.toFixed(1) },
  { key: 'receivedAt', heading: 'received' },
];

const SHORT_COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'onHand', heading: 'on hand', align: 'right', format: weight },
  { key: 'reorderPoint', heading: 'reorder at', align: 'right', format: weight },
  { key: 'shortBy', heading: 'short by', align: 'right', format: weight },
];

const NEED_COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'needKg', heading: 'card needs', align: 'right', format: weight },
  { key: 'onHand', heading: 'on hand', align: 'right', format: weight },
  { key: 'state', heading: 'state' },
];

export function registerStockCommand(program, { out }) {
  program
    .command('stock')
    .description('show what is on hand, what a card needs and what is short')
    .requiredOption('-s, --stock <path>', 'the stock lots file')
    .option('-c, --card <path>', 'a dispensing card to check against')
    .option('--reorder <path>', 'a file of reorder points')
    .option('--code <article>', 'show only this article')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const stock = createStock();
      await readRows(options.stock, (row) => receiveLot(stock, row), { what: 'stock file' });
      const lots = stock.lots.filter(
        (lot) => lot.remainingKg > 0 && (!options.code || lot.code === options.code)
      );

      const short = options.reorder
        ? belowReorder(stock, await readObject(options.reorder, { what: 'reorder file' }))
        : [];

      let needs = [];
      if (options.card) {
        const card = await readObject(options.card, { what: 'card file' });
        if (!Array.isArray(card.lines)) {
          throw dataError('the card file must carry a lines array');
        }
        needs = card.lines.map((line) => {
          const held = onHand(stock, line.code);
          return {
            code: line.code,
            needKg: line.kg,
            onHand: held,
            state: held >= line.kg ? 'enough' : 'short',
          };
        });
      }

      respond(out, options.format, {
        json: { lots, short, needs, value: valueOnHand(stock) },
        sections: [
          { table: { columns: LOT_COLUMNS, rows: lots, empty: 'nothing on hand' } },
          {
            block: [
              ['lots', String(lots.length)],
              ['value', money(valueOnHand(stock, options.code))],
            ],
          },
          { table: { columns: NEED_COLUMNS, rows: needs } },
          { table: { columns: SHORT_COLUMNS, rows: short } },
        ],
      });

      if (needs.some((need) => need.state === 'short')) {
        const names = needs.filter((need) => need.state === 'short').map((need) => need.code);
        throw new CommandError(`not enough stock to dispense ${names.join(', ')}`, 'outOfStock');
      }
    });
}

export function openLots(stock, code) {
  return lotsFor(stock, code);
}

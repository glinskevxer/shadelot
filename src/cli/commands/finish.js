/**
 * The finish command.
 *
 * Prescribes a softener and a dose for a handle the customer asked for, and
 * prints what it costs on every other axis. It always prints the trade off,
 * even on a pass, because the complaint that follows a finish is never about
 * the handle: it is about the thing the handle was bought with.
 */

import {
  SOFTENERS,
  applyFinish,
  describeTradeoff,
  judgeFinish,
  prescribeFinish,
} from '../../quality/handle.js';
import { signed } from '../../report/format.js';
import { respond } from '../report.js';
import { CommandError, dataError } from '../exit.js';
import { numberFlag, readObject } from '../io.js';

const AXES = ['handle', 'rubWet', 'sewability', 'slippage', 'whiteness'];

const COLUMNS = [
  { key: 'axis', heading: 'axis' },
  { key: 'before', heading: 'greige', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'after', heading: 'finished', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'change', heading: 'moved', align: 'right', format: (v) => signed(v, 2) },
  {
    key: 'floor',
    heading: 'asked for',
    align: 'right',
    format: (v) => (v === null ? '-' : v.toFixed(2)),
  },
  { key: 'state', heading: 'state' },
];

export function registerFinishCommand(program, { out }) {
  program
    .command('finish')
    .description('prescribe a softener for a handle, and show what it costs elsewhere')
    .requiredOption('-c, --cloth <path>', 'the panel scores on the unfinished cloth')
    .option('--handle <score>', 'the handle the customer asked for', numberFlag('--handle'))
    .option('--rub-wet <score>', 'the wet rub fastness floor', numberFlag('--rub-wet'))
    .option('--slippage <score>', 'the seam slippage floor', numberFlag('--slippage'))
    .option('--softener <name>', `run this one instead of choosing: ${SOFTENERS.join(', ')}`)
    .option('--owf <percent>', 'the dose, with a named softener', numberFlag('--owf'), 1)
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const cloth = await readObject(options.cloth, { what: 'cloth file' });
      for (const axis of AXES) {
        if (cloth[axis] !== undefined && typeof cloth[axis] !== 'number') {
          throw dataError(`${axis} in the cloth file must be a number on the panel scale`);
        }
      }
      const specification = {};
      if (options.handle !== undefined) specification.handle = options.handle;
      if (options.rubWet !== undefined) specification.rubWet = options.rubWet;
      if (options.slippage !== undefined) specification.slippage = options.slippage;

      let chosen;
      if (options.softener) {
        const result = applyFinish(cloth, options.softener, options.owf);
        chosen = { softener: options.softener, owf: options.owf, result, cost: null };
      } else {
        if (Object.keys(specification).length === 0) {
          throw dataError('nothing was asked for, so there is nothing to prescribe');
        }
        chosen = prescribeFinish(cloth, specification);
      }

      const judged = judgeFinish(chosen.result, specification);
      const floors = new Map(Object.entries(specification));
      const rows = AXES.map((axis) => {
        const before = typeof cloth[axis] === 'number' ? cloth[axis] : 3;
        const after = chosen.result[axis];
        const floor = floors.has(axis) ? floors.get(axis) : null;
        return {
          axis,
          before,
          after,
          change: after - before,
          floor,
          state: floor === null ? '' : after >= floor ? 'met' : 'short',
        };
      });

      respond(out, options.format, {
        json: { ...chosen, verdict: judged.verdict, breaches: judged.breaches, rows },
        sections: [
          { table: { columns: COLUMNS, rows } },
          {
            block: [
              ['softener', chosen.softener],
              ['dose', `${chosen.owf} percent on weight`],
              [
                'asked for',
                Object.entries(specification)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ') || 'nothing',
              ],
              ['verdict', judged.verdict],
              ['trade off', describeTradeoff(cloth, chosen.result)],
            ],
          },
        ],
      });

      if (judged.verdict === 'fail') {
        const axes = judged.breaches.map((breach) => breach.axis).join(', ');
        throw new CommandError(`the finish does not meet ${axes}`, 'outOfTolerance');
      }
    });
}

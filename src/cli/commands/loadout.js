/**
 * The loadout command.
 *
 * Puts a day of lots onto the machines that are free and shows the compromise
 * it made. The two numbers under the table are the argument: mean fill is what
 * the works manager is measured on and the worst ratio miss is what the shade
 * room will be dealing with on Thursday.
 */

import { DEFAULT_WEIGHTS, assign, splitLot } from '../../machine/loading.js';
import { findMachine } from '../../machine/register.js';
import { percent, weight } from '../../report/format.js';
import { respond } from '../report.js';
import { dataError } from '../exit.js';
import { collect, numberFlag, positiveFlag, readArray } from '../io.js';
import { loadWorks } from '../works.js';

const PLACED_COLUMNS = [
  { key: 'lotId', heading: 'lot' },
  { key: 'machineId', heading: 'machine' },
  { key: 'mass', heading: 'kg', align: 'right', format: weight },
  { key: 'fill', heading: 'fill', align: 'right', format: (v) => percent(v) },
  { key: 'ratio', heading: 'ratio', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'ratioMiss', heading: 'miss', align: 'right', format: (v) => percent(v) },
];

const UNPLACED_COLUMNS = [
  { key: 'lotId', heading: 'lot' },
  { key: 'mass', heading: 'kg', align: 'right', format: weight },
  { key: 'reason', heading: 'why not', width: 48 },
];

export function registerLoadoutCommand(program, { out }) {
  program
    .command('loadout')
    .description('put a day of lots onto the machines and show the compromise it made')
    .requiredOption('-w, --works <path>', 'the works file')
    .requiredOption('-g, --lots <path>', 'the lots file')
    .option('--ratio <value>', 'the liquor ratio the recipes want', positiveFlag('--ratio'), 8)
    .option(
      '--fill-weight <value>',
      'how much fill factor counts',
      numberFlag('--fill-weight'),
      DEFAULT_WEIGHTS.fill
    )
    .option('--exclude <machine>', 'a machine that is down, repeatable', collect, [])
    .option('--split', 'split a lot that is too big for anything')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      const rows = await readArray(options.lots, { what: 'lots file' });
      if (rows.length === 0) {
        throw dataError('the lots file holds nothing to load');
      }
      for (const [index, row] of rows.entries()) {
        if (!row.id || typeof row.mass !== 'number' || row.mass <= 0) {
          throw dataError(`lot ${index} in the lots file needs an id and a mass`);
        }
      }
      for (const id of options.excludes ?? options.exclude) {
        findMachine(works.machines, id);
      }
      const down = new Set(options.exclude);
      const machines = [...works.machines.values()].filter((machine) => !down.has(machine.id));
      if (machines.length === 0) {
        throw dataError('every machine in the works file is excluded');
      }

      const fill = options.fillWeight;
      const weights = { fill, ratio: 1 - fill };
      let lots = rows;
      if (options.split) {
        const biggest = machines.reduce((best, machine) =>
          machine.maxLoadKg > best.maxLoadKg ? machine : best
        );
        lots = rows.flatMap((lot) => splitLot(lot, biggest));
      }

      const plan = assign(lots, machines, { wantedRatio: options.ratio, weights });

      respond(out, options.format, {
        json: { ...plan, weights, ratio: options.ratio },
        sections: [
          {
            table: { columns: PLACED_COLUMNS, rows: plan.placed, empty: 'nothing could be placed' },
          },
          { table: { columns: UNPLACED_COLUMNS, rows: plan.unplaced } },
          {
            block: [
              ['lots', String(lots.length)],
              ['placed', String(plan.placed.length)],
              ['machines free', String(machines.length)],
              ['idle after', plan.idle.join(', ') || 'none'],
              ['mean fill', percent(plan.meanFill)],
              ['worst ratio miss', percent(plan.worstRatioMiss)],
              ['weighting', `fill ${weights.fill.toFixed(2)}, ratio ${weights.ratio.toFixed(2)}`],
            ],
          },
        ],
      });
    });
}

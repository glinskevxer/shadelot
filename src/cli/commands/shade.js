/**
 * The shade command.
 *
 * Judges a batch reading against a standard under a named tolerance block and
 * prints every axis rather than the one number. A pass with one axis nearly at
 * its limit is a different thing from a pass in the middle of the block, and
 * the shade room needs to see which it is.
 */

import { describeDifference } from '../../colour/lab.js';
import { formulaNames } from '../../colour/deltae.js';
import { judge, makeTolerance } from '../../colour/tolerance.js';
import { signed } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { EXIT, CommandError, dataError } from '../exit.js';
import { numberFlag, readObject } from '../io.js';
import { loadWorks, toleranceNamed } from '../works.js';

const AXIS_COLUMNS = [
  { key: 'axis', heading: 'axis' },
  { key: 'value', heading: 'batch less standard', align: 'right', format: (v) => signed(v, 3) },
  {
    key: 'limit',
    heading: 'limit',
    align: 'right',
    format: (v) => (v === null ? 'none' : v.toFixed(2)),
  },
  { key: 'state', heading: 'state' },
];

function requireReading(value, what) {
  if (
    !value ||
    typeof value.L !== 'number' ||
    typeof value.a !== 'number' ||
    typeof value.b !== 'number'
  ) {
    throw dataError(`the ${what} must carry L, a and b as numbers`);
  }
  return value;
}

export function registerShadeCommand(program, { out }) {
  program
    .command('shade')
    .description('judge a batch reading against a standard under a tolerance block')
    .requiredOption('-s, --standard <path>', 'the standard reading file')
    .requiredOption('-b, --batch <path>', 'the batch reading file')
    .option('-w, --works <path>', 'the works file, for its named tolerance blocks')
    .option('-t, --tolerance <name>', 'the tolerance block to judge under')
    .option('--formula <name>', `one of ${formulaNames().join(', ')}`, 'cmc')
    .option('--total <units>', 'total tolerance when no block is named', numberFlag('--total'), 1)
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const standard = requireReading(
        await readObject(options.standard, { what: 'standard' }),
        'standard'
      );
      const batch = requireReading(
        await readObject(options.batch, { what: 'batch reading' }),
        'batch reading'
      );

      let block;
      if (options.tolerance) {
        if (!options.works) {
          throw dataError('a named tolerance needs the works file it lives in');
        }
        block = toleranceNamed(await loadWorks(options.works), options.tolerance);
      } else {
        block = makeTolerance({
          name: 'given on the command line',
          formula: options.formula,
          total: options.total,
        });
      }

      const result = judge(block, standard, batch);
      const rows = ['dL', 'dC', 'dH'].map((axis) => {
        const limit = block.axes[axis];
        const value = result.difference[axis];
        const breached = result.breaches.some((breach) => breach.axis === axis);
        return { axis, value, limit, state: breached ? 'over' : 'inside' };
      });

      if (options.format === 'json') {
        out.write(JSON.stringify({ ...result, tolerance: block.name, axes: rows }, null, 2));
      } else {
        out.write(
          renderRecord([
            ['tolerance', `${block.name} (${block.formula}, total ${block.total})`],
            ['difference', result.value.toFixed(3)],
            ['verdict', result.verdict],
            ['reads as', describeDifference(standard, batch)],
          ])
        );
        out.write('');
        out.write(render(options.format, AXIS_COLUMNS, rows));
      }

      if (result.verdict === 'fail') {
        throw new CommandError(
          `the batch is out of tolerance at ${result.value.toFixed(3)}`,
          'outOfTolerance'
        );
      }
      return EXIT.ok;
    });
}

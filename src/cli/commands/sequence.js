/**
 * The sequence command.
 *
 * Takes a day of batches and prints the order to run them in, with the cleaning
 * each changeover needs and what the ordering saved. The saving is the point:
 * without it the command is an opinion, and with it the planner can decide
 * whether an urgent order is worth the hour it costs everybody else.
 */

import {
  changeover,
  dayLoad,
  sequenceCost,
  sequenceDay,
  sequencingSaving,
} from '../../schedule/sequence.js';
import { duration, percent } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { dataError } from '../exit.js';
import { numberFlag, readArray } from '../io.js';

const COLUMNS = [
  { key: 'position', heading: 'run', align: 'right', format: (v) => String(v) },
  { key: 'id', heading: 'batch' },
  { key: 'dyeClass', heading: 'class' },
  { key: 'depth', heading: 'depth', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'clean', heading: 'clean first' },
  { key: 'cleanMinutes', heading: 'clean', align: 'right', format: (v) => duration(v) },
  { key: 'runMinutes', heading: 'runs', align: 'right', format: (v) => duration(v) },
  { key: 'reason', heading: 'why', width: 40 },
];

function readBatches(rows) {
  return rows.map((row, index) => {
    if (typeof row.depth !== 'number' || !row.id) {
      throw dataError(`batch ${index} in the day file needs an id and a depth`);
    }
    return {
      id: row.id,
      depth: row.depth,
      dyeClass: row.dyeClass ?? 'reactive',
      runMinutes: row.runMinutes ?? 180,
      dueAt: row.dueAt ?? null,
    };
  });
}

export function registerSequenceCommand(program, { out }) {
  program
    .command('sequence')
    .description('order a day of batches light to dark and cost the changeovers')
    .requiredOption('-d, --day <path>', 'a file of the day batches')
    .option('--urgent-before <date>', 'pull anything due on or before this date forward')
    .option('--hours <count>', 'machine hours in the day', numberFlag('--hours'), 24)
    .option('--as-given', 'cost the order the batches arrived in instead')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const batches = readBatches(await readArray(options.day, { what: 'day file' }));
      if (batches.length === 0) {
        throw dataError('the day file holds no batches');
      }
      const sequenceOptions = { urgentBefore: options.urgentBefore ?? null };
      const ordered = options.asGiven ? batches : sequenceDay(batches, sequenceOptions);
      const cost = sequenceCost(ordered);
      const saving = sequencingSaving(batches, sequenceOptions);
      const load = dayLoad(ordered, { hoursAvailable: options.hours });

      const rows = ordered.map((batch, index) => {
        const step = changeover(index === 0 ? null : ordered[index - 1], batch);
        return {
          position: index + 1,
          id: batch.id,
          dyeClass: batch.dyeClass,
          depth: batch.depth,
          clean: step.clean,
          cleanMinutes: step.minutes,
          runMinutes: batch.runMinutes,
          reason: step.reason,
        };
      });

      if (options.format === 'json') {
        out.write(JSON.stringify({ order: rows, cost, saving, load }, null, 2));
        return;
      }

      out.write(render(options.format, COLUMNS, rows));
      out.write('');
      out.write(
        renderRecord([
          ['batches', String(batches.length)],
          ['cleaning', duration(rows.reduce((sum, row) => sum + row.cleanMinutes, 0))],
          ['total', duration(cost.minutes)],
          ['as they arrived', duration(saving.asGivenMinutes)],
          ['saved by ordering', duration(saving.savedMinutes)],
          ['hours needed', `${load.hours.toFixed(1)} of ${options.hours}`],
          ['utilisation', percent(load.utilisation)],
          ['overrun', load.overrun > 0 ? duration(load.overrun * 60) : 'none'],
        ])
      );
    });
}

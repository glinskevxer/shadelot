/**
 * The dip command.
 *
 * Runs a lab dip series against a standard: every dip judged as it lands, the
 * closest one named, and the whole series kept. It reads a file rather than
 * taking readings on the command line because a series is five or six readings
 * and typing them twice is how a shade room loses an afternoon.
 */

import { makeTolerance } from '../../colour/tolerance.js';
import {
  addDip,
  bestDip,
  closeSubmission,
  makeSubmission,
  passingDips,
  roundsTaken,
} from '../../labdip/submission.js';
import { signed } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { CommandError, dataError } from '../exit.js';
import { readShaped } from '../io.js';
import { toReading as reading } from '../readings.js';
import { resolveTolerance } from '../works.js';

const COLUMNS = [
  { key: 'round', heading: 'round', align: 'right', format: (v) => String(v) },
  { key: 'recipeId', heading: 'recipe' },
  { key: 'value', heading: 'difference', align: 'right', format: (v) => v.toFixed(3) },
  { key: 'dL', heading: 'dL', align: 'right', format: (v) => signed(v, 2) },
  { key: 'dC', heading: 'dC', align: 'right', format: (v) => signed(v, 2) },
  { key: 'dH', heading: 'dH', align: 'right', format: (v) => signed(v, 2) },
  { key: 'verdict', heading: 'verdict' },
  { key: 'note', heading: 'note', width: 30 },
];

export function registerDipCommand(program, { out }) {
  program
    .command('dip')
    .description('judge a lab dip series against a standard and name the closest')
    .requiredOption('-s, --series <path>', 'the dip series file')
    .option('-w, --works <path>', 'the works file, for its named tolerance blocks')
    .option('-t, --tolerance <name>', 'the tolerance block to judge under')
    .option('--close', 'close the submission on the closest dip')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const document = await readShaped(options.series, 'dipSeries', { what: 'dip series' });
      if (document.dips.length === 0) {
        throw dataError('the dip series must carry a dips array with at least one reading');
      }
      const { block } = await resolveTolerance(
        options,
        makeTolerance({
          name: document.toleranceName ?? 'works default',
          formula: document.formula ?? 'cmc',
          total: document.total ?? 1,
        })
      );

      const submission = makeSubmission({
        id: document.id ?? 'L00-00000',
        customer: document.customer ?? 'unnamed customer',
        standardName: document.standardName ?? 'unnamed standard',
        standard: reading(document.standard, 'standard'),
        substrate: document.substrate ?? 'unstated',
        tolerance: block,
      });

      for (const [index, dip] of document.dips.entries()) {
        addDip(submission, {
          recipeId: dip.recipeId ?? `round ${index + 1}`,
          reading: reading(dip.reading ?? dip, `dip ${index + 1}`),
          note: dip.note,
        });
      }

      const rows = submission.dips.map((dip) => ({
        round: dip.round,
        recipeId: dip.recipeId,
        value: dip.value,
        dL: dip.difference.dL,
        dC: dip.difference.dC,
        dH: dip.difference.dH,
        verdict: dip.verdict,
        note: dip.note ?? '',
      }));
      const best = bestDip(submission);

      if (options.close) {
        closeSubmission(submission, passingDips(submission).length > 0 ? 'approved' : 'rejected');
      }

      if (options.format === 'json') {
        out.write(
          JSON.stringify({ dips: rows, best: best.recipeId, outcome: submission.outcome }, null, 2)
        );
      } else {
        out.write(render(options.format, COLUMNS, rows));
        out.write('');
        out.write(
          renderRecord([
            ['standard', submission.standardName],
            ['customer', submission.customer],
            ['tolerance', `${block.name} (${block.formula}, total ${block.total})`],
            ['rounds', String(roundsTaken(submission))],
            ['closest', `${best.recipeId} at ${best.value.toFixed(3)}`],
            ['passing', String(passingDips(submission).length)],
            ['outcome', submission.outcome],
          ])
        );
      }

      if (passingDips(submission).length === 0) {
        throw new CommandError('no dip in the series is inside the tolerance', 'outOfTolerance');
      }
    });
}

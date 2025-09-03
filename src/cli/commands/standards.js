/**
 * The standards command.
 *
 * Reads the standards register and says which ones have drifted and which are
 * due a re-measure. It is the only command whose answer changes with nothing
 * but the passing of time, which is why it takes the date rather than reading
 * the clock: a report nobody can reproduce tomorrow is a report nobody trusts.
 */

import {
  drift,
  currentReading,
  dueForRemeasure,
  isTrustworthy,
  makeStandard,
} from '../../labdip/standard.js';
import { formulaNames } from '../../colour/deltae.js';
import { signed } from '../../report/format.js';
import { respond } from '../report.js';
import { CommandError } from '../exit.js';
import { numberFlag, readRows } from '../io.js';
import { toReading } from '../readings.js';

const COLUMNS = [
  { key: 'id', heading: 'standard' },
  { key: 'name', heading: 'name', width: 24 },
  { key: 'customer', heading: 'customer', width: 20 },
  { key: 'readings', heading: 'reads', align: 'right', format: (v) => String(v) },
  { key: 'lastMeasured', heading: 'last read' },
  {
    key: 'drift',
    heading: 'drift',
    align: 'right',
    format: (v) => (v === null ? '-' : signed(v, 3)),
  },
  { key: 'state', heading: 'state' },
];

const DUE_COLUMNS = [
  { key: 'id', heading: 'standard' },
  { key: 'name', heading: 'name', width: 24 },
  { key: 'lastMeasured', heading: 'last read' },
  { key: 'dueAt', heading: 'was due' },
];

export function registerStandardsCommand(program, { out }) {
  program
    .command('standards')
    .description('say which standards have drifted and which are due a re-measure')
    .requiredOption('-s, --standards <path>', 'the standards register file')
    .requiredOption('--today <date>', 'the date to report against')
    .option('--formula <name>', `one of ${formulaNames().join(', ')}`, 'cmc')
    .option(
      '--limit <units>',
      'the drift that stops a standard being used',
      numberFlag('--limit'),
      0.5
    )
    .option('--only <state>', 'good, drifted or retired')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const standards = await readRows(
        options.standards,
        (document, index) =>
          makeStandard({
            ...document,
            readings: (document.readings ?? []).map((entry) => ({
              ...entry,
              reading: toReading(entry.reading, `standard ${document.id ?? index} reading`),
            })),
          }),
        { what: 'standards register' }
      );

      const rows = standards.map((standard) => {
        const moved = drift(standard, { formula: options.formula });
        const trust = isTrustworthy(standard, { limit: options.limit, formula: options.formula });
        return {
          id: standard.id,
          name: standard.name,
          customer: standard.customer,
          readings: standard.readings.length,
          lastMeasured: currentReading(standard).at,
          drift: moved.measured ? moved.value : null,
          state: standard.retired ? 'retired' : trust.trustworthy ? 'good' : 'drifted',
          reason: trust.reason,
        };
      });

      const shown = options.only ? rows.filter((row) => row.state === options.only) : rows;
      const due = dueForRemeasure(standards, options.today);
      const drifted = rows.filter((row) => row.state === 'drifted');

      respond(out, options.format, {
        json: { standards: shown, due, drifted: drifted.map((row) => row.id) },
        sections: [
          { table: { columns: COLUMNS, rows: shown, empty: 'no standard is in that state' } },
          { table: { columns: DUE_COLUMNS, rows: due } },
          {
            block: [
              ['register', String(standards.length)],
              ['reporting on', options.today],
              ['drifted', drifted.length === 0 ? 'none' : drifted.map((row) => row.id).join(', ')],
              ['due a re-measure', due.length === 0 ? 'none' : String(due.length)],
              ['formula', options.formula],
            ],
          },
        ],
      });

      if (drifted.length > 0) {
        throw new CommandError(
          `${drifted.length} standard(s) have drifted past ${options.limit}: ${drifted.map((row) => row.id).join(', ')}`,
          'outOfTolerance'
        );
      }
    });
}

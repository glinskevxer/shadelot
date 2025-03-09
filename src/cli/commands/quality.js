/**
 * The quality command.
 *
 * Grades a roll from its fault list and says who caused the points. Two
 * arguments happen with every complaint and this settles both: whether the roll
 * is a first, and how much of the reason is ours. The second one is the one the
 * weaver disputes, so the split is printed whether anybody asked or not.
 */

import { CAUSES, gradeRoll, makeFault, ourShare, pointsByCause } from '../../quality/defects.js';
import { barreRisk } from '../../greige/beam.js';
import { percent } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { CommandError, dataError } from '../exit.js';
import { numberFlag, readObject } from '../io.js';

const FAULT_COLUMNS = [
  { key: 'atMetres', heading: 'at', align: 'right', format: (v) => `${v.toFixed(1)} m` },
  { key: 'kind', heading: 'fault' },
  { key: 'lengthCm', heading: 'length', align: 'right', format: (v) => `${v.toFixed(1)} cm` },
  { key: 'points', heading: 'points', align: 'right', format: (v) => String(v) },
  { key: 'cause', heading: 'cause' },
  { key: 'note', heading: 'note', width: 30 },
];

const CAUSE_COLUMNS = [
  { key: 'cause', heading: 'cause' },
  { key: 'points', heading: 'points', align: 'right', format: (v) => String(v) },
  { key: 'share', heading: 'share', align: 'right', format: (v) => percent(v) },
  { key: 'ours', heading: 'ours' },
];

export function registerQualityCommand(program, { out }) {
  program
    .command('quality')
    .description('grade a roll from its fault list and split the points by cause')
    .requiredOption('-r, --roll <path>', 'the roll file with its faults')
    .option(
      '--limit <points>',
      'points per hundred square metres for a first',
      numberFlag('--limit'),
      20
    )
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const document = await readObject(options.roll, { what: 'roll file' });
      for (const field of ['id', 'lengthMetres', 'widthCm']) {
        if (document[field] === undefined) {
          throw dataError(`the roll file has no ${field}`);
        }
      }
      const faults = (document.faults ?? []).map((fault, index) => {
        try {
          return makeFault({ rollId: document.id, ...fault });
        } catch (error) {
          throw dataError(`fault ${index} on ${document.id} is not usable, ${error.message}`);
        }
      });

      const dimensions = { lengthMetres: document.lengthMetres, widthCm: document.widthCm };
      const graded = gradeRoll(faults, dimensions, { limit: options.limit });
      const byCause = pointsByCause(faults);
      const total = Object.values(byCause).reduce((sum, points) => sum + points, 0);
      const causeRows = CAUSES.filter((cause) => byCause[cause] > 0).map((cause) => ({
        cause,
        points: byCause[cause],
        share: total === 0 ? 0 : byCause[cause] / total,
        ours: ['dyeing', 'finishing', 'handling'].includes(cause) ? 'yes' : 'no',
      }));

      const barre = document.rolls ? barreRisk(document.rolls) : null;

      if (options.format === 'json') {
        out.write(JSON.stringify({ ...graded, faults, causes: causeRows, barre }, null, 2));
      } else {
        out.write(
          render(
            options.format,
            FAULT_COLUMNS,
            faults.map((fault) => ({ ...fault, note: fault.note ?? '' }))
          )
        );
        out.write('');
        out.write(render(options.format, CAUSE_COLUMNS, causeRows));
        out.write('');
        out.write(
          renderRecord([
            ['roll', document.id],
            ['size', `${document.lengthMetres} m at ${document.widthCm} cm`],
            ['faults', String(faults.length)],
            ['points per hundred', graded.score.toFixed(2)],
            ['limit', String(options.limit)],
            ['grade', graded.grade],
            ['our share', percent(ourShare(faults))],
            ['barre risk', barre ? `${barre.risk}, ${barre.reason}` : 'no beam data on the file'],
          ])
        );
      }

      if (graded.grade === 'second') {
        throw new CommandError(
          `${document.id} grades a second at ${graded.score.toFixed(2)} points per hundred`,
          'outOfTolerance'
        );
      }
    });
}

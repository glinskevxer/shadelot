/**
 * The plan command.
 *
 * Puts a set of greige lots on a machine and says what the machine will really
 * run at. The line that matters is the re-dose warning: a planner who moves a
 * batch to a smaller machine to fit the schedule has changed the recipe whether
 * they meant to or not, and the command says so on its face.
 */

import { assessFit, fillFactor, planBatch } from '../../batch/plan.js';
import { findMachine } from '../../machine/register.js';
import { makeRecipe } from '../../recipe/recipe.js';
import { percent, weight } from '../../report/format.js';
import { respond } from '../report.js';
import { CommandError, notFoundError } from '../exit.js';
import { readArray, readShaped } from '../io.js';
import { loadWorks } from '../works.js';

const COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'kind', heading: 'kind' },
  { key: 'dose', heading: 'dose', align: 'right', format: (value) => value.toFixed(3) },
  { key: 'kg', heading: 'kg', align: 'right', format: weight },
];

const CANDIDATE_COLUMNS = [
  { key: 'id', heading: 'machine' },
  { key: 'type', heading: 'type' },
  { key: 'fits', heading: 'fits' },
  { key: 'reason', heading: 'reason' },
  {
    key: 'ratio',
    heading: 'ratio',
    align: 'right',
    format: (v) => (v === null ? '-' : v.toFixed(2)),
  },
];

export function registerPlanCommand(program, { out }) {
  program
    .command('plan')
    .description('put a set of lots on a machine and show what it will actually run')
    .requiredOption('-w, --works <path>', 'the works file')
    .requiredOption('-r, --recipe <path>', 'the recipe file')
    .requiredOption('-g, --greige <path>', 'the greige lots file')
    .option('-m, --machine <id>', 'the machine to plan onto')
    .option('-b, --batch <id>', 'the batch number', 'B00-00000')
    .option('--candidates', 'list every machine and whether the load fits')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      const recipe = makeRecipe(
        await readShaped(options.recipe, 'recipe', { what: 'recipe file' }),
        works
      );
      const lots = await readArray(options.greige, { what: 'lots file' });
      const fibreKg = lots.reduce((sum, lot) => sum + Number(lot.mass ?? 0), 0);
      if (!(fibreKg > 0)) {
        throw new CommandError('the lots file totals no cloth at all', 'invalidData');
      }

      const wantsCandidates = options.candidates || !options.machine;
      const candidates = wantsCandidates
        ? [...works.machines.values()].map((machine) => {
            const fit = assessFit(machine, recipe, fibreKg);
            return {
              id: machine.id,
              type: machine.type,
              fits: fit.fits ? 'yes' : 'no',
              reason: fit.reason,
              ratio: fit.fits
                ? (machine.deadVolumeLitres + machine.litresPerKg * fibreKg) / fibreKg
                : null,
            };
          })
        : [];

      let batch = null;
      let machine = null;
      if (options.machine) {
        machine = findMachine(works.machines, options.machine);
        const fit = assessFit(machine, recipe, fibreKg);
        if (!fit.fits) {
          throw notFoundError(`${fibreKg.toFixed(1)} kg does not fit ${machine.id}: ${fit.reason}`);
        }
        batch = planBatch(
          { id: options.batch, machine, recipe, lots },
          {
            catalogue: works.catalogue,
            chemicals: works.chemicals,
            saltCode: works.saltCode,
            alkaliCode: works.alkaliCode,
          }
        );
      }

      respond(out, options.format, {
        json: batch ?? { load: fibreKg, candidates },
        sections: [
          wantsCandidates
            ? { block: [['load', `${weight(fibreKg)} kg over ${lots.length} lots`]] }
            : null,
          wantsCandidates ? { table: { columns: CANDIDATE_COLUMNS, rows: candidates } } : null,
          batch
            ? {
                block: [
                  ['batch', batch.id],
                  ['machine', `${machine.id} (${machine.type})`],
                  [
                    'load',
                    `${weight(batch.fibreKg)} kg, ${percent(fillFactor(machine, batch.fibreKg))} of capacity`,
                  ],
                  ['bath', `${batch.litres} litres`],
                  ['ratio asked', batch.plannedRatio.toFixed(2)],
                  ['ratio given', batch.actualRatio.toFixed(2)],
                  ['drift', percent(batch.ratioDrift)],
                  ['re-dosed', batch.redosed ? 'yes, the grams per litre lines have moved' : 'no'],
                ],
              }
            : null,
          batch ? { table: { columns: COLUMNS, rows: batch.card.lines } } : null,
        ],
      });
    });
}

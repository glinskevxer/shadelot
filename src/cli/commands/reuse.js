/**
 * The reuse command.
 *
 * Says whether the next batch can go in the bath the last one came out of, and
 * what it saves. It prints the saving alongside the verdict because a refusal
 * with no number against it gets overruled at eleven at night, and one with the
 * number against it gets argued about properly.
 */

import {
  DEFAULTS,
  assessReuse,
  correctedCharge,
  reuseChain,
  savingFrom,
  settingsFrom,
} from '../../utility/reuse.js';
import { residual } from '../../utility/reuse.js';
import { makeRecipe } from '../../recipe/recipe.js';
import { money, percent } from '../../report/format.js';
import { respond } from '../report.js';
import { dataError } from '../exit.js';
import { numberFlag, positiveFlag, readArray, readShaped } from '../io.js';
import { loadWorks } from '../works.js';

const CHARGE_COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'owf', heading: 'to charge', align: 'right', format: (v) => v.toFixed(4) },
  { key: 'fromBath', heading: 'from the bath', align: 'right', format: (v) => v.toFixed(4) },
];

export function registerReuseCommand(program, { out }) {
  program
    .command('reuse')
    .description('say whether the next batch can go in the bath the last one left')
    .requiredOption('-w, --works <path>', 'the works file')
    .requiredOption('--previous <path>', 'the recipe that has just run')
    .requiredOption('--next <path>', 'the recipe that wants the bath')
    .option('--litres <volume>', 'the bath volume', positiveFlag('--litres'), 1600)
    .option('--salt <gpl>', 'salt in the bath that ran', numberFlag('--salt'), 50)
    .option('--alkali <gpl>', 'alkali in the bath that ran', numberFlag('--alkali'), 12)
    .option(
      '--fixation <fraction>',
      'fixation the last batch achieved',
      numberFlag('--fixation'),
      0.75
    )
    .option(
      '--reuses <count>',
      'times this bath has already been reused',
      numberFlag('--reuses'),
      0
    )
    .option('--chain <path>', 'a run of recipes to test as one chain')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      const previous = makeRecipe(
        await readShaped(options.previous, 'recipe', { what: 'previous recipe' }),
        works
      );
      const next = makeRecipe(
        await readShaped(options.next, 'recipe', { what: 'next recipe' }),
        works
      );
      const settings = settingsFrom({ maximumReuses: DEFAULTS.maximumReuses });

      const left = residual(
        {
          litres: options.litres,
          saltGpl: options.salt,
          alkaliGpl: options.alkali,
          dyeOwf: previous.totalOwf,
          reuses: options.reuses,
        },
        { fixation: options.fixation, settings }
      );

      const assessment = assessReuse({ ...previous, reuses: options.reuses }, next, {
        settings,
        residualDyeOwf: left.dyeOwf,
      });
      const saving = savingFrom(left, {
        waterPerCubicMetre: works.tariff?.waterPerCubicMetre ?? 1.4,
        saltPerKg: 0.12,
      });
      const charge =
        assessment.verdict === 'drop'
          ? []
          : correctedCharge(next, Math.min(left.dyeOwf, next.totalOwf * 0.9));

      let chain = null;
      if (options.chain) {
        const documents = await readArray(options.chain, { what: 'chain file' });
        const built = documents.map((document, index) => {
          try {
            return makeRecipe(document, works);
          } catch (error) {
            throw dataError(`recipe ${index} in the chain is not usable, ${error.message}`);
          }
        });
        chain = reuseChain(built, { settings });
      }

      respond(out, options.format, {
        json: { assessment, residual: left, saving, charge, chain },
        sections: [
          {
            block: [
              ['previous', `${previous.id} at ${previous.totalOwf.toFixed(3)} percent`],
              ['next', `${next.id} at ${next.totalOwf.toFixed(3)} percent`],
              ['reuses so far', String(options.reuses)],
              ['salt left', `${left.saltGpl.toFixed(1)} g per litre`],
              ['dye left', `${left.dyeOwf.toFixed(4)} percent on weight`],
              ['verdict', assessment.verdict],
              ['because', assessment.reason],
              [
                'saves',
                `${saving.waterM3.toFixed(2)} cubic metres and ${saving.saltKg.toFixed(1)} kg salt`,
              ],
              ['worth', money(saving.value)],
              ['as a share of the charge', percent(Math.min(1, left.dyeOwf / next.totalOwf))],
              chain ? ['chain', chain.join(' then ')] : null,
            ].filter(Boolean),
          },
          { table: { columns: CHARGE_COLUMNS, rows: charge } },
        ],
      });
    });
}

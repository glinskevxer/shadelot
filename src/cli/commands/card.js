/**
 * The card command.
 *
 * Takes a recipe and a load weight and prints what the dispensary has to weigh
 * out. This is the command the floor runs most, so it prints the load and the
 * bath volume at the top: an operator who cannot see those two numbers cannot
 * tell whether the card belongs to the machine in front of them.
 */

import { buildCard } from '../../recipe/card.js';
import { makeRecipe } from '../../recipe/recipe.js';
import { money, weight } from '../../report/format.js';
import { respond } from '../report.js';
import { positiveFlag, readShaped } from '../io.js';
import { loadWorks } from '../works.js';

const COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'name', heading: 'name', width: 26 },
  { key: 'basis', heading: 'basis' },
  { key: 'dose', heading: 'dose', align: 'right', format: (value) => value.toFixed(3) },
  { key: 'kg', heading: 'kg', align: 'right', format: weight },
  { key: 'balance', heading: 'balance' },
];

export function registerCardCommand(program, { out }) {
  program
    .command('card')
    .description('print the dispensing card for a recipe on a given load')
    .requiredOption('-w, --works <path>', 'the works file')
    .requiredOption('-r, --recipe <path>', 'the recipe file')
    .requiredOption('-l, --load <kg>', 'the load in kilograms', positiveFlag('--load'))
    .option(
      '--tolerance <fraction>',
      'rounding tolerance per line',
      positiveFlag('--tolerance'),
      0.02
    )
    .option('--no-electrolyte', 'leave the works salt and alkali off the card')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      const document = await readShaped(options.recipe, 'recipe', { what: 'recipe file' });
      const recipe = makeRecipe(document, works);
      const context = {
        catalogue: works.catalogue,
        chemicals: works.chemicals,
        tolerance: options.tolerance,
        saltCode: options.electrolyte ? works.saltCode : null,
        alkaliCode: options.electrolyte ? works.alkaliCode : null,
      };
      const card = buildCard(recipe, options.load, context);
      const cost = card.lines.reduce((sum, line) => sum + line.kg * line.unitPrice, 0);

      respond(out, options.format, {
        json: { ...card, cost },
        sections: [
          {
            block: [
              ['recipe', `${recipe.id}  ${recipe.name}`],
              ['substrate', recipe.substrate],
              ['load', `${options.load} kg`],
              ['bath', `${card.litres} litres at ${recipe.liquorRatio.toFixed(1)} to 1`],
              ['depth', `${recipe.band}, ${recipe.totalOwf.toFixed(3)} percent on weight`],
              ['dyes', `${weight(card.dyeKg)} kg`],
              ['charge', money(cost)],
            ],
          },
          { table: { columns: COLUMNS, rows: card.lines, empty: 'nothing to dispense' } },
        ],
      });
    });
}

/**
 * The library command.
 *
 * Answers the only question a new enquiry asks: have we done anything like this
 * before. It searches the dip library on the standard and the recipe library on
 * the dye ratios, and prints both, because a match on either is worth having and
 * a match on neither is worth knowing before the lab starts.
 */

import { createDipLibrary, search } from '../../labdip/library.js';
import { createLibrary, nearest, scaleToDepth } from '../../recipe/library.js';
import { makeRecipe } from '../../recipe/recipe.js';
import { formulaNames } from '../../colour/deltae.js';
import { percent } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { dataError } from '../exit.js';
import { numberFlag, readArray, readObject } from '../io.js';
import { toReading } from '../readings.js';
import { loadWorks } from '../works.js';

const DIP_COLUMNS = [
  { key: 'submissionId', heading: 'submission' },
  { key: 'standardName', heading: 'standard', width: 24 },
  { key: 'customer', heading: 'customer', width: 20 },
  { key: 'substrate', heading: 'substrate', width: 20 },
  { key: 'distance', heading: 'distance', align: 'right', format: (v) => v.toFixed(3) },
  { key: 'rounds', heading: 'rounds', align: 'right', format: (v) => String(v) },
  { key: 'approved', heading: 'approved', format: (v) => (v ? 'yes' : 'no') },
];

const RECIPE_COLUMNS = [
  { key: 'id', heading: 'recipe' },
  { key: 'name', heading: 'name', width: 26 },
  { key: 'distance', heading: 'ratio gap', align: 'right', format: (v) => v.toFixed(4) },
  { key: 'depthRatio', heading: 'depth', align: 'right', format: (v) => `${v.toFixed(2)}x` },
  { key: 'runs', heading: 'runs', align: 'right', format: (v) => String(v) },
  {
    key: 'rightFirstTime',
    heading: 'rft',
    align: 'right',
    format: (v) => (v === null ? '-' : percent(v)),
  },
];

export function registerLibraryCommand(program, { out }) {
  program
    .command('library')
    .description('find the work already done against a standard like this one')
    .requiredOption('-s, --standard <path>', 'the standard the enquiry arrived with')
    .option('--dips <path>', 'the dip library file')
    .option('--recipes <path>', 'the recipe library file')
    .option('-w, --works <path>', 'the works file, needed to read the recipe library')
    .option('--substrate <name>', 'prefer work done on this substrate')
    .option('--formula <name>', `one of ${formulaNames().join(', ')}`, 'cmc')
    .option('--within <units>', 'how far to look', numberFlag('--within'), 6)
    .option('--limit <count>', 'how many to show', numberFlag('--limit'), 5)
    .option('--target <owf>', 'scale the nearest recipe to this depth', numberFlag('--target'))
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const standard = toReading(
        await readObject(options.standard, { what: 'standard' }),
        'standard'
      );
      const searchOptions = {
        formula: options.formula,
        within: options.within,
        limit: options.limit,
        substrate: options.substrate ?? null,
      };

      let dips = [];
      if (options.dips) {
        const library = createDipLibrary(
          (await readArray(options.dips, { what: 'dip library' })).map((entry) => ({
            ...entry,
            standard: toReading(entry.standard, `dip library entry ${entry.submissionId}`),
          }))
        );
        dips = search(library, standard, searchOptions);
      }

      let recipes = [];
      let scaled = null;
      if (options.recipes) {
        if (!options.works) {
          throw dataError('the recipe library needs the works file its dyes live in');
        }
        const works = await loadWorks(options.works);
        const documents = await readArray(options.recipes, { what: 'recipe library' });
        const built = documents.map((document, index) => {
          try {
            return makeRecipe(document, works);
          } catch (error) {
            throw dataError(`recipe ${index} in the library is not usable, ${error.message}`);
          }
        });
        const library = createLibrary(built);
        const target = built.find((recipe) => recipe.id === dips[0]?.recipeId) ?? built[0];
        recipes = nearest(library, target, { limit: options.limit, maxDistance: 2 });
        if (options.target !== undefined) {
          scaled = scaleToDepth(target, options.target);
        }
      }

      if (options.format === 'json') {
        out.write(JSON.stringify({ dips, recipes, scaled }, null, 2));
        return;
      }

      out.write(renderRecord([['looking for', `L ${standard.L} a ${standard.a} b ${standard.b}`]]));
      if (dips.length > 0) {
        out.write('');
        out.write(render(options.format, DIP_COLUMNS, dips));
      } else if (options.dips) {
        out.write('');
        out.write('nothing in the dip library is close to this standard');
      }
      if (recipes.length > 0) {
        out.write('');
        out.write(render(options.format, RECIPE_COLUMNS, recipes));
      }
      if (scaled) {
        out.write('');
        out.write(
          render(
            options.format,
            [
              { key: 'code', heading: 'article' },
              { key: 'owf', heading: 'owf', align: 'right', format: (v) => v.toFixed(4) },
            ],
            scaled.dyes
          )
        );
      }
    });
}

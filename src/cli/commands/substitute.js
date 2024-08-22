/**
 * The substitute command.
 *
 * A dye goes out of stock on a Friday afternoon and somebody has to decide what
 * else will do. The command lists the candidates with the factor to redose at
 * and what each one does to the cost, and it never says yes on its own: the
 * confidence column is the answer and the rest is working.
 */

import { CONFIDENCE, proposeSubstitutes } from '../../dyestuff/strength.js';
import { find } from '../../dyestuff/catalogue.js';
import { money, percent } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { CommandError } from '../exit.js';
import { collect, numberFlag } from '../io.js';
import { loadWorks } from '../works.js';

const COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'supplier', heading: 'supplier', width: 20 },
  { key: 'confidence', heading: 'confidence' },
  { key: 'factor', heading: 'redose at', align: 'right', format: (v) => v.toFixed(4) },
  { key: 'costRatio', heading: 'cost', align: 'right', format: (v) => percent(v, 0) },
  { key: 'reason', heading: 'why', width: 44 },
];

function parseFloors(pairs) {
  const floors = {};
  for (const pair of pairs) {
    const [test, value] = pair.split('=');
    const rating = Number(value);
    if (!test || !Number.isFinite(rating)) {
      throw new CommandError(`--fastness wants something like wash=4, received ${pair}`, 'usage');
    }
    floors[test] = rating;
  }
  return floors;
}

export function registerSubstituteCommand(program, { out }) {
  program
    .command('substitute')
    .description('propose replacements for a dye that has run out')
    .requiredOption('-w, --works <path>', 'the works file')
    .requiredOption('-c, --code <article>', 'the article that has run out')
    .option('--fastness <test=rating>', 'a fastness floor, repeatable', collect, [])
    .option('--dose <owf>', 'a dose to convert, in percent on weight', numberFlag('--dose'))
    .option('--all', 'include the candidates that are unsuitable')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      const original = find(works.catalogue, options.code);
      const rows = proposeSubstitutes(works.catalogue, options.code, {
        fastnessFloor: parseFloors(options.fastness),
        includeUnsuitable: Boolean(options.all),
      });

      const withDose = rows.map((row) => ({
        ...row,
        dose: options.dose === undefined ? null : options.dose * row.factor,
      }));

      if (options.format === 'json') {
        out.write(JSON.stringify({ original: original.code, candidates: withDose }, null, 2));
        return;
      }

      out.write(
        renderRecord([
          ['article', `${original.code}  ${original.name}`],
          ['supplier', original.supplier],
          ['class', original.dyeClass],
          ['colour index', original.colourIndex ?? 'not recorded'],
          ['strength', `${original.strength}`],
          ['price', money(original.pricePerKg)],
        ])
      );
      out.write('');
      if (withDose.length === 0) {
        out.write('nothing in the catalogue shares this colour index');
        return;
      }
      const columns =
        options.dose === undefined
          ? COLUMNS
          : [
              ...COLUMNS,
              { key: 'dose', heading: 'owf', align: 'right', format: (v) => v.toFixed(4) },
            ];
      out.write(render(options.format, columns, withDose));
      if (withDose.every((row) => row.confidence !== 'direct')) {
        out.write('');
        out.write('none of these is a direct swap, every one needs a lab dip first');
      }
    });
}

export const confidences = CONFIDENCE;

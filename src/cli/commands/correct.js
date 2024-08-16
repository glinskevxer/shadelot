/**
 * The correct command.
 *
 * Runs the correction rules over a failed batch and says what to do with it.
 * It prints the rule that fired as well as the answer, because an operator who
 * disagrees with the answer needs to know which rule to argue about.
 */

import { makeLab } from '../../colour/lab.js';
import { judge, makeTolerance } from '../../colour/tolerance.js';
import { ACTIONS, addOnDose, decide, readFacts, usesMachineTime } from '../../shade/correction.js';
import { percent, signed, weight } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { dataError } from '../exit.js';
import { numberFlag, readObject } from '../io.js';
import { loadWorks, toleranceNamed } from '../works.js';

const DOSE_COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'owf', heading: 'recipe owf', align: 'right', format: (v) => v.toFixed(3) },
  { key: 'addOwf', heading: 'add owf', align: 'right', format: (v) => v.toFixed(4) },
  { key: 'addKg', heading: 'add kg', align: 'right', format: weight },
];

function reading(document, what) {
  if (!document || typeof document.L !== 'number') {
    throw dataError(`the ${what} must carry L, a and b as numbers`);
  }
  return makeLab(document.L, document.a, document.b);
}

export function registerCorrectCommand(program, { out }) {
  program
    .command('correct')
    .description('say what to do with a batch that came off shade')
    .requiredOption('-s, --standard <path>', 'the standard reading file')
    .requiredOption('-b, --batch <path>', 'the batch reading file')
    .option('-w, --works <path>', 'the works file')
    .option('-t, --tolerance <name>', 'the tolerance block to judge under')
    .option('-r, --recipe <path>', 'the recipe, to work an add on dose out')
    .option('-l, --load <kg>', 'the load in kilograms', numberFlag('--load'))
    .option('--strength <fraction>', 'measured colour strength', numberFlag('--strength'))
    .option(
      '--exhaustion <fraction>',
      'expected exhaustion on a second bath',
      numberFlag('--exhaustion'),
      0.7
    )
    .option('--prior <count>', 'corrections already run on this batch', numberFlag('--prior'), 0)
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const standard = reading(
        await readObject(options.standard, { what: 'standard' }),
        'standard'
      );
      const batch = reading(
        await readObject(options.batch, { what: 'batch reading' }),
        'batch reading'
      );
      const works = options.works ? await loadWorks(options.works) : null;
      const block = options.tolerance
        ? toleranceNamed(works, options.tolerance)
        : makeTolerance({ name: 'works default', formula: 'cmc', total: 1 });

      const verdict = judge(block, standard, batch);
      const context = {
        standard,
        batch,
        verdict: verdict.verdict,
        strength: options.strength,
        priorCorrections: options.prior,
      };
      const facts = readFacts(context);
      const outcome = decide(context);

      let doses = [];
      if (outcome.action === 'add-on' && options.recipe && options.load) {
        const document = await readObject(options.recipe, { what: 'recipe file' });
        doses = document.dyes.map((dye) => {
          const addOwf = addOnDose(dye.owf, facts.strength, { exhaustion: options.exhaustion });
          return { code: dye.code, owf: dye.owf, addOwf, addKg: (options.load * addOwf) / 100 };
        });
      }

      if (options.format === 'json') {
        out.write(JSON.stringify({ ...outcome, verdict: verdict.verdict, doses }, null, 2));
        return;
      }

      out.write(
        renderRecord([
          ['verdict', `${verdict.verdict} at ${verdict.value.toFixed(3)} ${block.formula}`],
          ['lightness', signed(facts.difference.dL, 3)],
          ['chroma', signed(facts.difference.dC, 3)],
          ['hue', signed(facts.difference.dH, 3)],
          ['strength', facts.strength === null ? 'not measured' : percent(facts.strength)],
          ['action', outcome.action],
          ['rule', outcome.rule],
          ['because', outcome.reason],
          ['machine time', usesMachineTime(outcome.action) ? 'yes' : 'no'],
        ])
      );
      if (doses.length > 0) {
        out.write('');
        out.write(render(options.format, DOSE_COLUMNS, doses));
      }
    });
}

export const actions = ACTIONS;

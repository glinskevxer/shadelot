/**
 * The metamerism command.
 *
 * Reads a standard and a batch under all three lamps and says whether the pair
 * holds together. It is a separate command from `shade` on purpose: a shade
 * judgement is one reading and this one refuses to run without three, and
 * merging them would let somebody get a metamerism answer out of one lamp.
 */

import {
  ILLUMINANTS,
  describeIlluminant,
  isMetameric,
  judgeAllIlluminants,
  metamerismIndex,
} from '../../colour/illuminant.js';
import { makeTolerance } from '../../colour/tolerance.js';
import { render, renderRecord } from '../../report/table.js';
import { CommandError } from '../exit.js';
import { numberFlag, readObject } from '../io.js';
import { toReadingSet } from '../readings.js';
import { resolveTolerance } from '../works.js';

const COLUMNS = [
  { key: 'illuminant', heading: 'lamp' },
  { key: 'description', heading: 'what it is', width: 26 },
  { key: 'difference', heading: 'difference', align: 'right', format: (v) => v.toFixed(3) },
  {
    key: 'drift',
    heading: 'drift',
    align: 'right',
    format: (v) => (v === null ? '-' : v.toFixed(3)),
  },
  { key: 'state', heading: 'state' },
];

export function registerMetamerismCommand(program, { out }) {
  program
    .command('metamerism')
    .description('read a pair under all three lamps and say whether the match holds')
    .requiredOption('-s, --standard <path>', 'the standard read under each illuminant')
    .requiredOption('-b, --batch <path>', 'the batch read under each illuminant')
    .option('-w, --works <path>', 'the works file, for its named tolerance blocks')
    .option('-t, --tolerance <name>', 'the tolerance block to judge under')
    .option('--primary <illuminant>', `the lamp the pair was matched under`, 'D65')
    .option('--limit <units>', 'the drift that counts as metameric', numberFlag('--limit'), 0.5)
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const standard = toReadingSet(
        await readObject(options.standard, { what: 'standard' }),
        'standard'
      );
      const batch = toReadingSet(
        await readObject(options.batch, { what: 'batch reading' }),
        'batch reading'
      );
      const { block } = await resolveTolerance(
        options,
        makeTolerance({ name: 'works default', formula: 'cmc', total: 1 })
      );

      const index = metamerismIndex(standard, batch, {
        primary: options.primary,
        formula: block.formula,
      });
      const judged = judgeAllIlluminants(standard, batch, block, { primary: options.primary });
      const metameric = isMetameric(index, { limit: options.limit });

      const rows = ILLUMINANTS.map((illuminant) => ({
        illuminant,
        description: describeIlluminant(illuminant).split(', ')[1],
        difference: index.differences[illuminant],
        drift:
          illuminant === index.primary
            ? null
            : Math.abs(index.differences[illuminant] - index.differences[index.primary]),
        state: judged.failing.includes(illuminant) ? 'out' : 'inside',
      }));

      if (options.format === 'json') {
        out.write(
          JSON.stringify({ ...index, metameric, verdict: judged.verdict, lamps: rows }, null, 2)
        );
      } else {
        out.write(render(options.format, COLUMNS, rows));
        out.write('');
        out.write(
          renderRecord([
            ['matched under', describeIlluminant(index.primary)],
            ['tolerance', `${block.name} (${block.formula}, total ${block.total})`],
            ['index', index.index.toFixed(3)],
            ['worst drift', `${index.worst.toFixed(3)} under ${index.worstUnder}`],
            ['metameric', metameric ? 'yes' : 'no'],
            ['verdict', judged.verdict],
          ])
        );
      }

      if (judged.verdict === 'fail' || metameric) {
        const reason = metameric
          ? `the pair drifts ${index.worst.toFixed(3)} under ${index.worstUnder}`
          : `the pair is out of tolerance under ${judged.failing.join(', ')}`;
        throw new CommandError(reason, 'outOfTolerance');
      }
    });
}

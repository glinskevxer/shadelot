/**
 * The cost command.
 *
 * Prices one batch off the works tariff and the dispensing card. It prints the
 * per saleable kilogram figure last and largest, because that is the number the
 * quoting argument is actually about, and every head above it is the working.
 */

import { COST_HEADS, costBatch, costShares, makeTariff } from '../../cost/batch.js';
import { batchWater, makeRinse } from '../../utility/water.js';
import { batchEnergy } from '../../utility/energy.js';
import { makeProfile } from '../../process/curve.js';
import { buildCard } from '../../recipe/card.js';
import { makeRecipe } from '../../recipe/recipe.js';
import { findMachine } from '../../machine/register.js';
import { money, percent } from '../../report/format.js';
import { respond } from '../report.js';
import { dataError } from '../exit.js';
import { numberFlag, positiveFlag, readShaped } from '../io.js';
import { loadWorks } from '../works.js';

const COLUMNS = [
  { key: 'head', heading: 'head' },
  { key: 'value', heading: 'cost', align: 'right', format: (v) => money(v) },
  { key: 'share', heading: 'share', align: 'right', format: (v) => percent(v) },
];

export function registerCostCommand(program, { out }) {
  program
    .command('cost')
    .description('price one batch off the works tariff and the card')
    .requiredOption('-w, --works <path>', 'the works file')
    .requiredOption('-r, --recipe <path>', 'the recipe file')
    .requiredOption('-m, --machine <id>', 'the machine it runs on')
    .requiredOption('-l, --load <kg>', 'the load in kilograms', positiveFlag('--load'))
    .option('-p, --profile <path>', 'the dyeing profile, for the energy')
    .option('--saleable <kg>', 'what came out saleable', numberFlag('--saleable'))
    .option('--passes <count>', 'how many times the batch was dyed', numberFlag('--passes'), 1)
    .option('--rinses <count>', 'drop and fill rinses after the dyeing', numberFlag('--rinses'), 3)
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      if (!works.tariff) {
        throw dataError('the works file carries no tariff, so nothing can be costed');
      }
      const tariff = makeTariff(works.tariff);
      const recipe = makeRecipe(
        await readShaped(options.recipe, 'recipe', { what: 'recipe file' }),
        works
      );
      const machine = findMachine(works.machines, options.machine);
      const litres = machine.deadVolumeLitres + machine.litresPerKg * options.load;

      const card = buildCard(recipe, options.load, {
        catalogue: works.catalogue,
        chemicals: works.chemicals,
        saltCode: works.saltCode,
        alkaliCode: works.alkaliCode,
      });
      const water = batchWater({
        bathLitres: litres,
        rinses: [makeRinse({ kind: 'drop-and-fill', baths: options.rinses })],
        soapBaths: 1,
      });
      const profile = options.profile
        ? makeProfile(await readShaped(options.profile, 'profile', { what: 'profile file' }))
        : null;
      const energy = profile
        ? batchEnergy(profile, { litres, machine })
        : { motorKwh: 0, steamKgEquivalent: 0, minutes: 240, totalKwh: 0 };

      const pass = { card, water, energy };
      const costing = costBatch({
        tariff,
        passes: Array.from({ length: options.passes }, () => pass),
        fibreKg: options.load,
        saleableKg: options.saleable,
      });

      const shares = new Map(costShares(costing).map((row) => [row.head, row.share]));
      respond(out, options.format, {
        json: { ...costing, litres, waterNet: water.net },
        sections: [
          {
            table: {
              columns: COLUMNS,
              rows: COST_HEADS.map((head) => ({
                head,
                value: costing.heads[head],
                share: shares.get(head) ?? 0,
              })),
            },
          },
          {
            block: [
              ['passes', String(costing.passes)],
              ['bath', `${litres} litres`],
              ['water', `${water.net} litres`],
              ['total', money(costing.total)],
              ['per kilo charged', money(costing.perKgCharged)],
              ['per kilo saleable', money(costing.perKgSaleable)],
              ['yield', percent(costing.yield)],
            ],
          },
        ],
      });
    });
}

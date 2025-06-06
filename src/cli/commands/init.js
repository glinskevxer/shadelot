/**
 * The init command.
 *
 * Writes a starter works file. It exists because the first thing anybody has to
 * do with this program is describe their plant, and a blank page is worse than
 * a wrong file: a wrong file can be edited and every command will say what is
 * wrong with it.
 *
 * It never overwrites. A works file is the whole plant and a command that can
 * flatten it by being run twice is a command nobody should trust.
 */

import { writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { CLASSES } from '../../dyestuff/catalogue.js';
import { MACHINE_TYPES } from '../../machine/register.js';
import { ROLES } from '../../chemical/catalogue.js';
import { assembleWorks } from '../works.js';
import { checkShape, fieldsFor } from '../../valid/schema.js';
import { respond } from '../report.js';
import { CommandError, dataError } from '../exit.js';

/** The smallest works file that every command will accept. */
export function starterWorks({ name = 'a works with no name yet' } = {}) {
  return {
    name,
    saltCode: 'NACL',
    alkaliCode: 'SODA',
    dyestuffs: [
      {
        code: 'RY-145',
        name: 'Reactive Yellow 145',
        supplier: 'change this',
        dyeClass: 'reactive',
        colourIndex: 'RY145',
        pricePerKg: 20,
        maxOwf: 6,
      },
      {
        code: 'RR-195',
        name: 'Reactive Red 195',
        supplier: 'change this',
        dyeClass: 'reactive',
        colourIndex: 'RR195',
        pricePerKg: 26,
        maxOwf: 6,
      },
      {
        code: 'RB-19',
        name: 'Reactive Blue 19',
        supplier: 'change this',
        dyeClass: 'reactive',
        colourIndex: 'RB19',
        pricePerKg: 24,
        maxOwf: 5,
      },
    ],
    chemicals: [
      {
        code: 'NACL',
        name: 'Common salt',
        role: 'salt',
        basis: 'gpl',
        pricePerKg: 0.12,
        maxDose: 120,
      },
      { code: 'SODA', name: 'Soda ash', role: 'alkali', basis: 'gpl', pricePerKg: 0.42 },
      { code: 'WET', name: 'Wetting agent', role: 'wetting', basis: 'owf', pricePerKg: 3.4 },
      { code: 'SEQ', name: 'Sequestrant', role: 'sequestrant', basis: 'gpl', pricePerKg: 3.9 },
    ],
    machines: [
      {
        id: 'MACHINE-1',
        type: 'jet',
        minLoadKg: 60,
        maxLoadKg: 300,
        deadVolumeLitres: 900,
        litresPerKg: 3.5,
        maxTemperature: 135,
        lossKwPerDegree: 0.05,
        motorKw: 18.5,
      },
    ],
    tolerances: [{ name: 'works default', formula: 'cmc', total: 1, dL: 0.7, dC: 0.7, dH: 0.7 }],
    tariff: {
      waterPerCubicMetre: 1.4,
      effluentPerCubicMetre: 0.9,
      electricityPerKwh: 0.19,
      steamPerTonne: 34,
      labourPerHour: 21,
      overheadPerMachineHour: 46,
    },
    consent: {
      name: 'change this to your own consent',
      volumeM3: 300,
      codKg: 400,
      tdsKg: 900,
      colourUnits: 250,
      phLow: 6,
      phHigh: 9,
    },
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function registerInitCommand(program, { out }) {
  program
    .command('init')
    .description('write a starter works file that every command will accept')
    .requiredOption('-w, --works <path>', 'where to write it')
    .option('--name <name>', 'the name of the works')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      if (await exists(options.works)) {
        throw new CommandError(
          `${options.works} is already there, and this command will not write over a works file`,
          'invalidData'
        );
      }
      const document = starterWorks({ name: options.name });
      const problems = checkShape(document, fieldsFor('works'), { what: 'starter works' });
      if (problems.length > 0) {
        throw dataError(`the starter is not usable: ${problems.join('; ')}`);
      }
      assembleWorks(document, options.works);
      await writeFile(options.works, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

      respond(out, options.format, {
        json: { written: options.works, ...document },
        sections: [
          {
            block: [
              ['written', options.works],
              ['works', document.name],
              ['dyestuffs', String(document.dyestuffs.length)],
              ['chemicals', String(document.chemicals.length)],
              ['machines', String(document.machines.length)],
            ],
          },
          {
            lines: [
              'now edit it:',
              `  the dye classes it will take are ${CLASSES.join(', ')}`,
              `  the chemical roles are ${ROLES.join(', ')}`,
              `  the machine types are ${MACHINE_TYPES.join(', ')}`,
              'then run: shadelot works -w ' + options.works,
            ],
          },
        ],
      });
    });
}

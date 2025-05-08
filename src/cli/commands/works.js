/**
 * The works command.
 *
 * Prints what the works file says the plant is. It exists because every other
 * command reads that file and half the support calls turn out to be a works
 * file the caller had not looked at, usually one with a machine missing or a
 * salt code that names nothing.
 */

import { liquorRatioBand } from '../../machine/register.js';
import { money } from '../../report/format.js';
import { respond } from '../report.js';
import { loadWorks } from '../works.js';

const MACHINE_COLUMNS = [
  { key: 'id', heading: 'machine' },
  { key: 'type', heading: 'type' },
  { key: 'minLoadKg', heading: 'min kg', align: 'right', format: (v) => v.toFixed(0) },
  { key: 'maxLoadKg', heading: 'max kg', align: 'right', format: (v) => v.toFixed(0) },
  { key: 'tightest', heading: 'tightest', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'loosest', heading: 'loosest', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'maxTemperature', heading: 'max C', align: 'right', format: (v) => v.toFixed(0) },
];

const DYE_COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'name', heading: 'name', width: 28 },
  { key: 'dyeClass', heading: 'class' },
  { key: 'colourIndex', heading: 'index' },
  { key: 'strength', heading: 'strength', align: 'right', format: (v) => v.toFixed(0) },
  { key: 'pricePerKg', heading: 'price', align: 'right', format: (v) => money(v) },
];

const CHEMICAL_COLUMNS = [
  { key: 'code', heading: 'article' },
  { key: 'name', heading: 'name', width: 28 },
  { key: 'role', heading: 'role' },
  { key: 'basis', heading: 'basis' },
  { key: 'pricePerKg', heading: 'price', align: 'right', format: (v) => money(v) },
];

const PARTS = ['machines', 'dyestuffs', 'chemicals', 'tolerances'];

export function registerWorksCommand(program, { out }) {
  program
    .command('works')
    .description('print what the works file says the plant is')
    .requiredOption('-w, --works <path>', 'the works file')
    .option('--only <part>', `one of ${PARTS.join(', ')}`)
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      const machines = [...works.machines.values()].map((machine) => ({
        ...machine,
        ...liquorRatioBand(machine),
      }));
      const dyes = [...works.catalogue.values()];
      const chemicals = [...works.chemicals.values()];
      const tolerances = [...works.tolerances.values()].map((block) => ({
        name: block.name,
        formula: block.formula,
        total: block.total,
        dL: block.axes.dL,
        dC: block.axes.dC,
        dH: block.axes.dH,
      }));

      const show = (part) => !options.only || options.only === part;
      respond(out, options.format, {
        json: { name: works.name, machines, dyes, chemicals, tolerances },
        sections: [
          options.only
            ? null
            : {
                block: [
                  ['works', works.name],
                  ['machines', String(machines.length)],
                  ['dyestuffs', String(dyes.length)],
                  ['chemicals', String(chemicals.length)],
                  ['salt', works.saltCode ?? 'not set'],
                  ['alkali', works.alkaliCode ?? 'not set'],
                  ['tariff', works.tariff ? 'present' : 'missing'],
                  ['consent', works.consent ? works.consent.name : 'missing'],
                ],
              },
          show('machines') ? { table: { columns: MACHINE_COLUMNS, rows: machines } } : null,
          show('dyestuffs') ? { table: { columns: DYE_COLUMNS, rows: dyes } } : null,
          show('chemicals') ? { table: { columns: CHEMICAL_COLUMNS, rows: chemicals } } : null,
          options.only === 'tolerances'
            ? {
                table: {
                  columns: [
                    { key: 'name', heading: 'block' },
                    { key: 'formula', heading: 'formula' },
                    { key: 'total', heading: 'total', align: 'right', format: (v) => v.toFixed(2) },
                  ],
                  rows: tolerances,
                  empty: 'the works file carries no tolerance blocks',
                },
              }
            : null,
        ],
      });
    });
}

export const parts = PARTS;

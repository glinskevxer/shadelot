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
import { render, renderRecord } from '../../report/table.js';
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

      if (options.format === 'json') {
        out.write(
          JSON.stringify({ name: works.name, machines, dyes, chemicals, tolerances }, null, 2)
        );
        return;
      }

      const show = (part) => !options.only || options.only === part;
      if (!options.only) {
        out.write(
          renderRecord([
            ['works', works.name],
            ['machines', String(machines.length)],
            ['dyestuffs', String(dyes.length)],
            ['chemicals', String(chemicals.length)],
            ['salt', works.saltCode ?? 'not set'],
            ['alkali', works.alkaliCode ?? 'not set'],
            ['tariff', works.tariff ? 'present' : 'missing'],
            ['consent', works.consent ? works.consent.name : 'missing'],
          ])
        );
      }
      if (show('machines')) {
        out.write('');
        out.write(render(options.format, MACHINE_COLUMNS, machines));
      }
      if (show('dyestuffs')) {
        out.write('');
        out.write(render(options.format, DYE_COLUMNS, dyes));
      }
      if (show('chemicals')) {
        out.write('');
        out.write(render(options.format, CHEMICAL_COLUMNS, chemicals));
      }
      if (options.only === 'tolerances') {
        out.write('');
        out.write(
          render(
            options.format,
            [
              { key: 'name', heading: 'block' },
              { key: 'formula', heading: 'formula' },
              { key: 'total', heading: 'total', align: 'right', format: (v) => v.toFixed(2) },
            ],
            tolerances
          )
        );
      }
    });
}

export const parts = PARTS;

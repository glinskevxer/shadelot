/**
 * The run sheet command.
 *
 * Prints the profile the machine will follow, with the elapsed clock down the
 * side. The elapsed column is what the shift supervisor plans against, and it
 * is worked from the ramp rates rather than typed in, so a profile edited to
 * ramp faster shortens the sheet on its own.
 */

import {
  fitsMachine,
  makeProfile,
  minutesAtOrAbove,
  peakTemperature,
  totalMinutes,
  walk,
} from '../../process/curve.js';
import { batchEnergy } from '../../utility/energy.js';
import { findMachine } from '../../machine/register.js';
import { duration, temperature } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { CommandError } from '../exit.js';
import { positiveFlag, readObject } from '../io.js';
import { worksIfNamed } from '../works.js';

const COLUMNS = [
  { key: 'elapsed', heading: 'clock', align: 'right', format: (value) => duration(value) },
  { key: 'kind', heading: 'kind' },
  { key: 'label', heading: 'step', width: 34 },
  { key: 'from', heading: 'from', align: 'right', format: (value) => temperature(value) },
  { key: 'to', heading: 'to', align: 'right', format: (value) => temperature(value) },
  { key: 'minutes', heading: 'takes', align: 'right', format: (value) => duration(value) },
];

export function registerRunSheetCommand(program, { out }) {
  program
    .command('run-sheet')
    .description('print the profile a machine will follow, with the clock down the side')
    .requiredOption('-p, --profile <path>', 'the profile file')
    .option('-w, --works <path>', 'the works file, to check the machine can reach it')
    .option('-m, --machine <id>', 'the machine it will run on')
    .option('-l, --load <kg>', 'the load, to work the energy out', positiveFlag('--load'))
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const profile = makeProfile(await readObject(options.profile, { what: 'profile file' }));
      const steps = walk(profile);
      let machine = null;
      if (options.machine) {
        const works = await worksIfNamed(options, { because: 'naming a machine' });
        machine = findMachine(works.machines, options.machine);
        const fit = fitsMachine(profile, machine);
        if (!fit.fits) {
          throw new CommandError(
            `${machine.id} cannot run this profile: ${fit.reason}`,
            'invalidData'
          );
        }
      }

      let energy = null;
      if (machine && options.load) {
        const litres = machine.deadVolumeLitres + machine.litresPerKg * options.load;
        energy = batchEnergy(profile, { litres, machine });
      }

      if (options.format === 'json') {
        out.write(JSON.stringify({ profile: profile.id, steps, energy }, null, 2));
        return;
      }

      const summary = [
        ['profile', `${profile.id}  ${profile.name}`],
        ['starts at', temperature(profile.startAt)],
        ['peak', temperature(peakTemperature(profile))],
        ['total', duration(totalMinutes(profile))],
        ['held at peak', duration(minutesAtOrAbove(profile, peakTemperature(profile)))],
      ];
      if (machine) summary.push(['machine', `${machine.id} (${machine.type})`]);
      if (energy) {
        summary.push(['heat', `${energy.totalKwh.toFixed(1)} kWh`]);
        summary.push(['steam', `${energy.steamKgEquivalent.toFixed(0)} kg`]);
        summary.push(['motors', `${energy.motorKwh.toFixed(1)} kWh`]);
      }
      out.write(renderRecord(summary));
      out.write('');
      out.write(render(options.format, COLUMNS, steps));
    });
}

/**
 * The effluent command.
 *
 * Totals a day of batches against the discharge consent. It exits with the
 * consent breached code rather than a plain failure, because the works runs it
 * on a cron at the end of the shift and the night manager needs the branch, not
 * a line of text nobody reads until Monday.
 */

import {
  batchLoad,
  checkConsent,
  consentReport,
  makeConsent,
  totalDay,
} from '../../effluent/load.js';
import { percent } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { CommandError, dataError } from '../exit.js';
import { numberFlag, readArray } from '../io.js';
import { loadWorks } from '../works.js';

const COLUMNS = [
  { key: 'parameter', heading: 'parameter' },
  { key: 'value', heading: 'day', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'limit', heading: 'consent', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'used', heading: 'used', align: 'right', format: (v) => percent(v) },
  { key: 'state', heading: 'state' },
];

export function registerEffluentCommand(program, { out }) {
  program
    .command('effluent')
    .description('total a day of batches against the discharge consent')
    .requiredOption('-w, --works <path>', 'the works file')
    .requiredOption('-d, --day <path>', 'a file of the day batches')
    .option('--ph <reading>', 'the composite ph reading', numberFlag('--ph'))
    .option('--fixation <fraction>', 'fixation to assume', numberFlag('--fixation'), 0.75)
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      if (!works.consent) {
        throw dataError('the works file carries no discharge consent');
      }
      const consent = makeConsent(works.consent);
      const batches = await readArray(options.day, { what: 'day file' });
      if (batches.length === 0) {
        throw dataError('the day file holds no batches');
      }
      const loads = batches.map((batch, index) => {
        if (!batch.card || !batch.water) {
          throw dataError(`batch ${index} in the day file needs a card and a water figure`);
        }
        return batchLoad({
          water: batch.water,
          card: batch.card,
          chemicals: works.chemicals,
          fixation: options.fixation,
        });
      });
      const day = totalDay(loads);
      const report = consentReport(consent, day, { ph: options.ph });
      const check = checkConsent(consent, day, { ph: options.ph });

      if (options.format === 'json') {
        out.write(JSON.stringify({ day, ...report }, null, 2));
      } else {
        const breached = new Set(check.breaches.map((breach) => breach.parameter));
        out.write(
          render(
            options.format,
            COLUMNS,
            report.ranked.map((row) => ({
              parameter: row.parameter,
              value: row.used * consentLimit(consent, row.parameter),
              limit: consentLimit(consent, row.parameter),
              used: row.used,
              state: breached.has(row.parameter) ? 'over' : 'inside',
            }))
          )
        );
        out.write('');
        out.write(
          renderRecord([
            ['consent', consent.name],
            ['batches', String(batches.length)],
            ['tightest', `${report.tightest.parameter} at ${percent(report.tightest.used)}`],
            ['ph', options.ph === undefined ? 'not read' : String(options.ph)],
            ['verdict', report.compliant ? 'inside consent' : 'breached'],
          ])
        );
      }

      if (!report.compliant) {
        const names = check.breaches.map((breach) => breach.parameter).join(', ');
        throw new CommandError(`the day breached the consent on ${names}`, 'consentBreached');
      }
    });
}

function consentLimit(consent, parameter) {
  const keys = { volume: 'volumeM3', cod: 'codKg', tds: 'tdsKg', colour: 'colourUnits' };
  return consent[keys[parameter]];
}

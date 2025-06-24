/**
 * The analyse command.
 *
 * The end of month, in one place. It reads a file of batches and prints the
 * four numbers, the split by whatever key is asked for, the pareto of the
 * failures, and the control chart on the shade differences. Nothing here is
 * new arithmetic; it is the arithmetic already in the modules, arranged in the
 * order the meeting goes.
 */

import { reworkCost, splitBy, summariseMonth, worstCost } from '../../analysis/monthly.js';
import { bar, compareCuts, pareto } from '../../analysis/pareto.js';
import { controlLimits, diagnose, signalsIn } from '../../analysis/control.js';
import { histogram, histogramLines, markedLine } from '../../report/chart.js';
import { byBatch, byWeight, failureModes } from '../../quality/rft.js';
import { assessWorks, needsAttention } from '../../analysis/benchmark.js';
import { money, percent } from '../../report/format.js';
import { render, renderRecord } from '../../report/table.js';
import { dataError } from '../exit.js';
import { numberFlag, readArray } from '../io.js';

const SPLIT_COLUMNS = (key) => [
  { key, heading: key },
  { key: 'batches', heading: 'batches', align: 'right', format: (v) => String(v) },
  { key: 'saleableKg', heading: 'kg', align: 'right', format: (v) => v.toFixed(0) },
  { key: 'rightFirstTime', heading: 'rft', align: 'right', format: (v) => percent(v) },
  { key: 'costPerSaleableKg', heading: 'per kg', align: 'right', format: (v) => money(v) },
];

const BENCHMARK_COLUMNS = [
  { key: 'measure', heading: 'measure' },
  { key: 'value', heading: 'works', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'typical', heading: 'typical', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'best', heading: 'best', align: 'right', format: (v) => v.toFixed(2) },
  { key: 'position', heading: 'in band', align: 'right', format: (v) => percent(v) },
  { key: 'verdict', heading: 'verdict' },
];

const PARETO_COLUMNS = [
  { key: 'value', heading: 'cause' },
  { key: 'count', heading: 'count', align: 'right', format: (v) => String(v) },
  { key: 'share', heading: 'share', align: 'right', format: (v) => percent(v) },
  { key: 'cumulative', heading: 'running', align: 'right', format: (v) => percent(v) },
  { key: 'plot', heading: '' },
];

function requireBatches(rows) {
  if (rows.length === 0) {
    throw dataError('the month file holds no batches');
  }
  for (const [index, row] of rows.entries()) {
    for (const field of ['id', 'fibreKg', 'cost', 'waterLitres', 'machineMinutes', 'passes']) {
      if (row[field] === undefined) {
        throw dataError(`batch ${index} in the month file has no ${field}`);
      }
    }
  }
  return rows;
}

export function registerAnalyseCommand(program, { out }) {
  program
    .command('analyse')
    .description('the end of the month in the order the meeting goes')
    .requiredOption('-m, --month <path>', 'a file of the month batches')
    .option('--split <key>', 'a field to split the month by', 'machineId')
    .option('--cause <key>', 'the field the failures are counted against', 'cause')
    .option('--hours <count>', 'machine hours available in the month', numberFlag('--hours'))
    .option(
      '--tolerance <units>',
      'the tolerance the shade chart is judged against',
      numberFlag('--tolerance'),
      1
    )
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const batches = requireBatches(await readArray(options.month, { what: 'month file' }));
      const month = summariseMonth(batches, { machineHoursAvailable: options.hours });
      const rework = reworkCost(batches);
      const split = splitBy(batches, options.split, { machineHoursAvailable: options.hours });
      const worst = worstCost(batches, { limit: 5 });

      const failed = batches.filter((batch) => batch.accepted !== true || batch.passes > 1);
      const causes =
        failed.length > 0 && failed.every((batch) => batch[options.cause] !== undefined)
          ? pareto(failed, options.cause).map((row) => ({ ...row, plot: bar(row.share) }))
          : [];
      const cuts = causes.length > 0 ? compareCuts(failed, options.cause) : null;

      const benchmarkValues = {
        litresPerKg: month.litresPerKg,
        rightFirstTime: byWeight(batches),
        costPerKg: month.costPerSaleableKg,
      };
      if (month.utilisation !== null) benchmarkValues.utilisation = month.utilisation;
      const benchmark = assessWorks(benchmarkValues);
      const attention = needsAttention(benchmark);

      const differences = batches
        .map((batch) => batch.shadeDifference)
        .filter((value) => typeof value === 'number');
      const chart = differences.length >= 2 ? signalsIn(differences) : null;
      const limits = chart ? controlLimits(differences) : null;

      if (options.format === 'json') {
        out.write(
          JSON.stringify(
            { month, rework, split, worst, causes, cuts, chart, limits, benchmark, attention },
            null,
            2
          )
        );
        return;
      }

      out.write(
        renderRecord([
          ['batches', String(month.batches)],
          ['cloth', `${month.saleableKg.toFixed(0)} kg saleable of ${month.fibreKg.toFixed(0)}`],
          [
            'right first time',
            `${percent(byBatch(batches))} by batch, ${percent(byWeight(batches))} by weight`,
          ],
          ['cost per kilo', money(month.costPerSaleableKg)],
          ['water per kilo', `${month.litresPerKg.toFixed(1)} litres`],
          ['machine hours', month.machineHours.toFixed(1)],
          ['utilisation', month.utilisation === null ? 'not stated' : percent(month.utilisation)],
          ['reworking', `${rework.extraPasses} extra passes, ${money(rework.cost)}`],
        ])
      );
      out.write('');
      out.write(render(options.format, SPLIT_COLUMNS(options.split), split));
      out.write('');
      out.write(render(options.format, BENCHMARK_COLUMNS, benchmark.rows));
      out.write('');
      out.write(
        renderRecord([
          [
            'against the trade',
            `worst on ${benchmark.worst.measure}, best on ${benchmark.best.measure}`,
          ],
          [
            'worth a project',
            attention.needed
              ? `yes, on ${attention.behind.join(' and ')}`
              : 'no, nothing is far behind',
          ],
        ])
      );
      if (causes.length > 0) {
        out.write('');
        out.write(render(options.format, PARETO_COLUMNS, causes));
        out.write('');
        out.write(renderRecord([['cuts', cuts.note]]));
      }
      if (chart) {
        const marked = markedLine(differences, chart.signals, { width: 48 });
        out.write('');
        out.write(
          renderRecord([
            ['shade run', marked.line],
            ['signals', marked.marks.trim() === '' ? 'none' : marked.marks],
            ['centre', chart.limits.centre.toFixed(3)],
            ['limits', `${chart.limits.lower.toFixed(3)} to ${chart.limits.upper.toFixed(3)}`],
          ])
        );
        out.write('');
        for (const line of histogramLines(histogram(differences, { bins: 8, width: 24 }), {
          places: 3,
        })) {
          out.write(line);
        }
      }

      out.write('');
      out.write(
        renderRecord([
          [
            'failure modes',
            failureModes(batches)
              .map((row) => `${row.outcome} ${row.count}`)
              .join(', ') || 'none',
          ],
          [
            'shade chart',
            chart ? diagnose(differences, options.tolerance) : 'no readings on the batches',
          ],
          [
            'dearest batch',
            worst.length > 0 ? `${worst[0].id} at ${money(worst[0].perKg)} a kilo` : 'none',
          ],
        ])
      );
    });
}

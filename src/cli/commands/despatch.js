/**
 * The despatch command.
 *
 * Packs a delivery into bales under the customer's own rule and prints the
 * note. It checks its own work before printing, because the failure this
 * command exists to prevent is one nobody catches until the cloth is at the
 * other end.
 */

import { RULES, checkPacking, makeInstruction, pack, packingNote } from '../../order/despatch.js';
import { respond } from '../report.js';
import { CommandError, dataError } from '../exit.js';
import { numberFlag, readArray } from '../io.js';

const BALE_COLUMNS = [
  { key: 'number', heading: 'bale', align: 'right', format: (v) => String(v) },
  { key: 'rollCount', heading: 'rolls', align: 'right', format: (v) => String(v) },
  { key: 'metres', heading: 'metres', align: 'right', format: (v) => v.toFixed(1) },
  { key: 'kg', heading: 'kg', align: 'right', format: (v) => v.toFixed(1) },
  { key: 'shadeList', heading: 'shades', width: 30 },
  { key: 'rollList', heading: 'rolls in it', width: 34 },
];

export function registerDespatchCommand(program, { out }) {
  program
    .command('despatch')
    .description('pack a delivery into bales under the customer rule and print the note')
    .requiredOption('-r, --rolls <path>', 'the finished rolls file')
    .requiredOption('-o, --order <id>', 'the order the delivery is against')
    .option('--rule <rule>', `one of ${RULES.join(', ')}`, 'one-shade-per-bale')
    .option('--customer <name>', 'the customer whose rule it is', 'unnamed customer')
    .option('--metres <count>', 'metres a bale for the fixed metres rule', numberFlag('--metres'))
    .option('--kg <count>', 'kilograms a bale for the fill to weight rule', numberFlag('--kg'))
    .option('--max-rolls <count>', 'most rolls a bale may hold', numberFlag('--max-rolls'), 8)
    .option('--at <date>', 'the despatch date')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const rolls = await readArray(options.rolls, { what: 'rolls file' });
      if (rolls.length === 0) {
        throw dataError('the rolls file holds nothing to despatch');
      }
      const instruction = makeInstruction({
        rule: options.rule,
        customer: options.customer,
        metresPerBale: options.metres,
        kgPerBale: options.kg,
        maxRollsPerBale: options.maxRolls,
      });

      const bales = pack(rolls, instruction);
      const check = checkPacking(bales, instruction);
      const note = packingNote(bales, { order: options.order, at: options.at });

      respond(out, options.format, {
        json: { instruction, bales, note, check },
        sections: [
          {
            table: {
              columns: BALE_COLUMNS,
              rows: bales.map((bale) => ({
                ...bale,
                shadeList: bale.shades.join(', '),
                rollList: bale.rolls.join(' '),
              })),
            },
          },
          {
            block: [
              ['order', note.order],
              ['customer', instruction.customer],
              ['rule', instruction.rule],
              ['despatched', note.at ?? 'not dated'],
              ['bales', String(note.bales)],
              ['rolls', String(note.rolls)],
              ['metres', note.metres.toFixed(1)],
              ['weight', `${note.kg.toFixed(1)} kg`],
              ['shades', note.shades.join(', ')],
            ],
          },
          check.ok ? null : { lines: ['the packing does not meet the rule:', ...check.problems] },
        ],
      });

      if (!check.ok) {
        throw new CommandError(
          `the packing breaks the ${instruction.rule} rule on ${check.problems.length} bale(s)`,
          'invalidData'
        );
      }
    });
}

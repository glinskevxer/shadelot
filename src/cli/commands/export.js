/**
 * The export command.
 *
 * Turns one of the json files into something the accounts package will take. It
 * writes to a file rather than to the screen because the thing on the other end
 * is an import dialogue, and it refuses to write over one because an export
 * that silently replaces last month's is how a month goes missing.
 */

import { writeFile, access } from 'node:fs/promises';
import { columnsFor, exportNames, toDelimited } from '../../store/export.js';
import { respond } from '../report.js';
import { CommandError } from '../exit.js';
import { readArray } from '../io.js';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function registerExportCommand(program, { out }) {
  program
    .command('export')
    .description('write one of the json files out for the accounts package')
    .requiredOption('-i, --input <path>', 'the json file to read')
    .requiredOption('-o, --output <path>', 'the file to write')
    .option('--set <name>', `the column set: ${exportNames().join(', ')}`, 'batches')
    .option('--delimited <format>', 'csv, tsv or psv', 'csv')
    .option('--no-header', 'leave the heading line off')
    .option('--overwrite', 'write over a file that is already there')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const columns = columnsFor(options.set);
      const rows = await readArray(options.input, { what: 'input file' });
      if (!options.overwrite && (await exists(options.output))) {
        throw new CommandError(
          `${options.output} is already there, pass --overwrite to replace it`,
          'invalidData'
        );
      }
      const text = toDelimited(columns, rows, {
        format: options.delimited,
        header: options.header,
      });
      await writeFile(options.output, text, 'utf8');

      const missing = columns
        .map((column) => column.key)
        .filter((key) => rows.every((row) => row[key] === undefined));

      respond(out, options.format, {
        json: { written: options.output, rows: rows.length, columns: columns.length, missing },
        sections: [
          {
            block: [
              ['written', options.output],
              ['from', options.input],
              ['column set', options.set],
              ['delimiter', options.delimited],
              ['rows', String(rows.length)],
              ['columns', String(columns.length)],
              ['bytes', String(Buffer.byteLength(text, 'utf8'))],
              ['heading line', options.header ? 'yes' : 'no'],
            ],
          },
          missing.length > 0
            ? {
                lines: [
                  'these columns were empty on every row, which usually means the wrong set:',
                  ...missing.map((key) => `  ${key}`),
                ],
              }
            : null,
        ],
      });
    });
}

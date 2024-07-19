/**
 * The listing command.
 *
 * It reads the parser rather than a hand written list, which is the point: a
 * command that exists is in the listing whether or not anybody remembered to
 * put it there.
 */

import { render } from '../../report/table.js';
import { describeCommands } from '../program.js';

const COLUMNS = [
  { key: 'command', heading: 'command' },
  { key: 'description', heading: 'what it does' },
];

export function registerCommandsCommand(program, { out }) {
  program
    .command('commands')
    .description('list every command this build carries')
    .option('--format <format>', 'table or json', 'table')
    .action((options) => {
      const rows = describeCommands(program).sort((a, b) => a.command.localeCompare(b.command));
      out.write(render(options.format, COLUMNS, rows));
    });
}

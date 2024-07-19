/**
 * The command line.
 *
 * Every command is registered here and nowhere else, so the listing the program
 * prints is the same list the parser was built from. That is the only way a
 * command can never be undocumented, and the works has been bitten by the
 * alternative.
 */

import { Command } from 'commander';
import { version } from '../version.js';
import { classify } from './exit.js';
import { stderr, stdout } from './io.js';
import { registerCommands } from './commands/index.js';

export function buildProgram({ out = stdout, err = stderr } = {}) {
  const program = new Command();
  program
    .name('shadelot')
    .description('batch, recipe and shade control for a commission dyehouse')
    .version(version, '-v, --version', 'print the version and leave')
    .configureOutput({
      writeOut: (text) => out.write(text.replace(/\n$/, '')),
      writeErr: (text) => err.write(text.replace(/\n$/, '')),
    })
    .exitOverride();

  registerCommands(program, { out, err });
  return program;
}

/** The commands the program carries, for the listing and for the tests. */
export function describeCommands(program) {
  return program.commands.map((command) => ({
    command: command.name(),
    description: command.description(),
    options: command.options.map((option) => option.flags),
  }));
}

export async function run(argv, { out = stdout, err = stderr } = {}) {
  const program = buildProgram({ out, err });
  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    if (error?.code === 'commander.version' || error?.code === 'commander.helpDisplayed') {
      return 0;
    }
    if (error?.code === 'commander.help') {
      return 0;
    }
    if (typeof error?.exitCode === 'number' && String(error.code ?? '').startsWith('commander.')) {
      err.write(error.message);
      return 2;
    }
    const { code, message } = classify(error);
    err.write(message);
    return code;
  }
}

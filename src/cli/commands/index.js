/**
 * The command registry.
 *
 * A command is a function that takes the program and the output pair and hangs
 * itself off it. Adding one means adding it to this list, and the listing
 * command walks the same list, so the two cannot drift.
 */

import { registerCardCommand } from './card.js';
import { registerCommandsCommand } from './commands-listing.js';
import { registerPlanCommand } from './plan.js';

const REGISTRARS = [registerCardCommand, registerCommandsCommand, registerPlanCommand];

export function registerCommands(program, context) {
  for (const register of REGISTRARS) {
    register(program, context);
  }
  return program;
}

export function registrarCount() {
  return REGISTRARS.length;
}

/**
 * The command registry.
 *
 * A command is a function that takes the program and the output pair and hangs
 * itself off it. Adding one means adding it to this list, and the listing
 * command walks the same list, so the two cannot drift.
 */

import { registerAnalyseCommand } from './analyse.js';
import { registerCardCommand } from './card.js';
import { registerCommandsCommand } from './commands-listing.js';
import { registerCorrectCommand } from './correct.js';
import { registerCostCommand } from './cost.js';
import { registerDespatchCommand } from './despatch.js';
import { registerDipCommand } from './dip.js';
import { registerEffluentCommand } from './effluent.js';
import { registerFinishCommand } from './finish.js';
import { registerInitCommand } from './init.js';
import { registerLibraryCommand } from './library.js';
import { registerLoadoutCommand } from './loadout.js';
import { registerMetamerismCommand } from './metamerism.js';
import { registerOrderCommand } from './order.js';
import { registerPlanCommand } from './plan.js';
import { registerQualityCommand } from './quality.js';
import { registerReuseCommand } from './reuse.js';
import { registerRunSheetCommand } from './run-sheet.js';
import { registerSequenceCommand } from './sequence.js';
import { registerShadeCommand } from './shade.js';
import { registerStandardsCommand } from './standards.js';
import { registerStockCommand } from './stock.js';
import { registerSubstituteCommand } from './substitute.js';
import { registerWorksCommand } from './works.js';

const REGISTRARS = [
  registerAnalyseCommand,
  registerCardCommand,
  registerCommandsCommand,
  registerCorrectCommand,
  registerCostCommand,
  registerDespatchCommand,
  registerDipCommand,
  registerEffluentCommand,
  registerFinishCommand,
  registerInitCommand,
  registerLibraryCommand,
  registerLoadoutCommand,
  registerMetamerismCommand,
  registerOrderCommand,
  registerPlanCommand,
  registerQualityCommand,
  registerReuseCommand,
  registerRunSheetCommand,
  registerSequenceCommand,
  registerShadeCommand,
  registerStandardsCommand,
  registerStockCommand,
  registerSubstituteCommand,
  registerWorksCommand,
];

export function registerCommands(program, context) {
  for (const register of REGISTRARS) {
    register(program, context);
  }
  return program;
}

export function registrarCount() {
  return REGISTRARS.length;
}

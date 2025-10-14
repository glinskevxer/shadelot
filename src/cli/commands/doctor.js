/**
 * The doctor command.
 *
 * Every other command validates one file. This one reads several together and
 * reports where they disagree, which is the failure nobody catches because each
 * file is individually correct: a recipe naming a dye the works dropped last
 * month, a works whose salt code is not in its own chemical list, a stock file
 * that cannot dispense any recipe on the floor, a machine no recipe can run on.
 *
 * It never writes and it never fixes. It exits with the invalid data code when
 * it finds something, so a cron job can run it nightly and shout.
 */

import { find } from '../../dyestuff/catalogue.js';
import { findChemical } from '../../chemical/catalogue.js';
import { makeRecipe } from '../../recipe/recipe.js';
import { assessFit } from '../../batch/plan.js';
import { createStock, onHand, receiveLot } from '../../inventory/stock.js';
import { respond } from '../report.js';
import { CommandError } from '../exit.js';
import { collect, readRows, readShaped } from '../io.js';
import { loadWorks } from '../works.js';

const COLUMNS = [
  { key: 'severity', heading: 'level' },
  { key: 'subject', heading: 'subject', width: 26 },
  { key: 'finding', heading: 'what disagrees', width: 62 },
];

/** The works file has to be consistent with itself before anything else matters. */
export function checkWorks(works) {
  const findings = [];
  for (const [role, code] of [
    ['salt', works.saltCode],
    ['alkali', works.alkaliCode],
  ]) {
    if (!code) {
      findings.push({
        severity: 'warn',
        subject: 'works',
        finding: `no ${role} code set, cards will carry no ${role}`,
      });
      continue;
    }
    if (!works.chemicals.has(code)) {
      findings.push({
        severity: 'error',
        subject: 'works',
        finding: `${role} code ${code} is not in its own chemical list`,
      });
    }
  }
  if (works.machines.size === 0) {
    findings.push({
      severity: 'error',
      subject: 'works',
      finding: 'no machines, nothing can be planned',
    });
  }
  if (!works.tariff) {
    findings.push({
      severity: 'warn',
      subject: 'works',
      finding: 'no tariff, nothing can be costed',
    });
  }
  if (!works.consent) {
    findings.push({
      severity: 'warn',
      subject: 'works',
      finding: 'no discharge consent, effluent cannot be judged',
    });
  }
  if (works.tolerances.size === 0) {
    findings.push({
      severity: 'warn',
      subject: 'works',
      finding: 'no tolerance blocks, every shade falls back to the default',
    });
  }
  return findings;
}

/** A recipe has to name things the works still stocks, and fit something. */
export function checkRecipe(works, recipe) {
  const findings = [];
  for (const dye of recipe.dyes) {
    try {
      find(works.catalogue, dye.code);
    } catch {
      findings.push({
        severity: 'error',
        subject: recipe.id,
        finding: `names dye ${dye.code}, which the works does not stock`,
      });
    }
  }
  for (const auxiliary of recipe.auxiliaries) {
    try {
      findChemical(works.chemicals, auxiliary.code);
    } catch {
      findings.push({
        severity: 'error',
        subject: recipe.id,
        finding: `names chemical ${auxiliary.code}, which the works does not stock`,
      });
    }
  }
  const runners = [...works.machines.values()].filter((machine) =>
    machine.processes.includes(recipe.process)
  );
  if (runners.length === 0) {
    findings.push({
      severity: 'error',
      subject: recipe.id,
      finding: `is a ${recipe.process} recipe and no machine runs that process`,
    });
  } else {
    const anyFits = runners.some((machine) => assessFit(machine, recipe, machine.minLoadKg).fits);
    if (!anyFits) {
      findings.push({
        severity: 'warn',
        subject: recipe.id,
        finding: 'no machine takes a load this recipe could run at',
      });
    }
  }
  return findings;
}

/** Stock has to be able to dispense what the recipes actually call for. */
export function checkStock(works, recipes, stock) {
  const findings = [];
  const wanted = new Set();
  for (const recipe of recipes) {
    for (const dye of recipe.dyes) wanted.add(dye.code);
    for (const auxiliary of recipe.auxiliaries) wanted.add(auxiliary.code);
  }
  for (const code of [works.saltCode, works.alkaliCode]) {
    if (code) wanted.add(code);
  }
  for (const code of [...wanted].sort()) {
    if (onHand(stock, code) <= 0) {
      findings.push({
        severity: 'error',
        subject: code,
        finding: 'is called for by a recipe and there is none on hand',
      });
    }
  }
  const held = new Set(stock.lots.filter((lot) => lot.remainingKg > 0).map((lot) => lot.code));
  for (const code of [...held].sort()) {
    if (!works.catalogue.has(code) && !works.chemicals.has(code)) {
      findings.push({
        severity: 'warn',
        subject: code,
        finding: 'is on the shelf and in neither the dye nor the chemical list',
      });
    }
  }
  return findings;
}

export function registerDoctorCommand(program, { out }) {
  program
    .command('doctor')
    .description('read several files together and report where they disagree')
    .requiredOption('-w, --works <path>', 'the works file')
    .option('-r, --recipe <path>', 'a recipe to check, repeatable', collect, [])
    .option('-s, --stock <path>', 'the stock lots file')
    .option('--strict', 'treat a warning as a finding worth failing on')
    .option('--format <format>', 'table or json', 'table')
    .action(async (options) => {
      const works = await loadWorks(options.works);
      const findings = [...checkWorks(works)];

      const recipes = [];
      for (const path of options.recipe) {
        const document = await readShaped(path, 'recipe', { what: 'recipe file' });
        try {
          const recipe = makeRecipe(document, works);
          recipes.push(recipe);
          findings.push(...checkRecipe(works, recipe));
        } catch (error) {
          findings.push({
            severity: 'error',
            subject: document.id ?? path,
            finding: error.message,
          });
        }
      }

      if (options.stock) {
        const stock = createStock();
        await readRows(options.stock, (row) => receiveLot(stock, row), { what: 'stock file' });
        findings.push(...checkStock(works, recipes, stock));
      }

      const errors = findings.filter((row) => row.severity === 'error');
      const warnings = findings.filter((row) => row.severity === 'warn');

      respond(out, options.format, {
        json: { findings, errors: errors.length, warnings: warnings.length },
        sections: [
          { table: { columns: COLUMNS, rows: findings, empty: 'nothing disagrees' } },
          {
            block: [
              ['works', works.name],
              ['recipes read', String(recipes.length)],
              ['stock read', options.stock ? 'yes' : 'no'],
              ['errors', String(errors.length)],
              ['warnings', String(warnings.length)],
              [
                'verdict',
                errors.length === 0 && (!options.strict || warnings.length === 0)
                  ? 'consistent'
                  : 'inconsistent',
              ],
            ],
          },
        ],
      });

      if (errors.length > 0 || (options.strict && warnings.length > 0)) {
        throw new CommandError(
          `${errors.length} error(s) and ${warnings.length} warning(s) across the files given`,
          'invalidData'
        );
      }
    });
}

/**
 * The public surface.
 *
 * Anything not re-exported here is internal and may move. The command line and
 * the tests both go through this module rather than reaching into a path, so a
 * rename inside a folder is not a breaking change.
 *
 * The order is the order the floor works in: what arrives, what it is made
 * into, what runs it, what judges it, what it cost, and what is written down.
 */

// what a number means
export * as units from './measure/units.js';
export * as fabric from './measure/fabric.js';
export * as rounding from './measure/rounding.js';
export * as guards from './valid/guards.js';
export * as schema from './valid/schema.js';
export * as ids from './model/ids.js';

// what arrives
export * as roll from './greige/roll.js';
export * as lot from './greige/lot.js';
export * as register from './greige/register.js';
export * as shrinkage from './greige/shrinkage.js';
export * as beam from './greige/beam.js';

// what goes in the bath
export * as dyestuff from './dyestuff/catalogue.js';
export * as strength from './dyestuff/strength.js';
export * as compatibility from './dyestuff/compatibility.js';
export * as chemical from './chemical/catalogue.js';

// what to weigh out
export * as depth from './recipe/depth.js';
export * as recipe from './recipe/recipe.js';
export * as card from './recipe/card.js';
export * as recipeLibrary from './recipe/library.js';
export * as trichromacy from './recipe/trichromacy.js';

// what runs it
export * as machine from './machine/register.js';
export * as availability from './machine/availability.js';
export * as changeover from './machine/changeover.js';
export * as loading from './machine/loading.js';
export * as batch from './batch/plan.js';
export * as curve from './process/curve.js';
export * as exhaust from './process/exhaust.js';
export * as padbatch from './process/padbatch.js';
export * as wash from './process/wash.js';
export * as preparation from './process/preparation.js';
export * as sequence from './schedule/sequence.js';

// what judges it
export * as lab from './colour/lab.js';
export * as deltae from './colour/deltae.js';
export * as tolerance from './colour/tolerance.js';
export * as reflectance from './colour/reflectance.js';
export * as illuminant from './colour/illuminant.js';
export * as whiteness from './colour/whiteness.js';
export * as labdip from './labdip/submission.js';
export * as dipLibrary from './labdip/library.js';
export * as standards from './labdip/standard.js';
export * as correction from './shade/correction.js';
export * as continuity from './shade/continuity.js';
export * as defects from './quality/defects.js';
export * as rft from './quality/rft.js';
export * as handle from './quality/handle.js';

// what it cost
export * as water from './utility/water.js';
export * as energy from './utility/energy.js';
export * as steam from './utility/steam.js';
export * as reuse from './utility/reuse.js';
export * as recovery from './utility/recovery.js';
export * as cost from './cost/batch.js';
export * as effluent from './effluent/load.js';
export * as treatment from './effluent/treatment.js';
export * as stock from './inventory/stock.js';
export * as shelflife from './inventory/shelflife.js';

// what is sold and what is written down
export * as order from './order/order.js';
export * as despatch from './order/despatch.js';
export * as invoice from './invoice/invoice.js';
export * as monthly from './analysis/monthly.js';
export * as variance from './analysis/variance.js';
export * as control from './analysis/control.js';
export * as pareto from './analysis/pareto.js';
export * as benchmark from './analysis/benchmark.js';
export * as trail from './audit/trail.js';
export * as store from './store/json.js';
export * as repository from './store/repository.js';
export * as backup from './store/backup.js';
export * as format from './report/format.js';
export * as table from './report/table.js';
export * as chart from './report/chart.js';

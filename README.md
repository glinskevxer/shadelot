# shadelot

Batch, recipe and shade control for a commission textile dyehouse.

The works takes greige cloth in, forms it into dye lots, runs those lots on jets,
winches, jigs and a pad mangle, and sends back finished cloth that has to match a
standard the customer sent. This program does the arithmetic in between, which is
mostly about three things: what to weigh out, what the machine will really do
with it, and whether what came out is close enough to ship.

Nothing here talks to a machine controller. It produces the numbers that go on
the card the operator carries.

## Running it

```
npm install
npm test
node bin/shadelot.js commands
```

Every command takes its inputs as json files rather than as flags, because a
recipe has thirty numbers in it. The `examples/` folder holds a working set:

```
node bin/shadelot.js card -w examples/works.json -r examples/recipe-olive.json -l 200
node bin/shadelot.js plan -w examples/works.json -r examples/recipe-olive.json -g examples/lots.json -m JET-4
node bin/shadelot.js loadout -w examples/works.json -g examples/lots.json
node bin/shadelot.js run-sheet -p examples/profile-reactive-60.json -w examples/works.json -m JET-4
node bin/shadelot.js sequence -d examples/day-sequence.json
node bin/shadelot.js dip -s examples/dip-series.json
node bin/shadelot.js order -o examples/order.json
node bin/shadelot.js quality -r examples/roll-faults.json
node bin/shadelot.js despatch -r examples/finished-rolls.json -o O25-0900
node bin/shadelot.js effluent -w examples/works.json -d examples/day-batches.json
node bin/shadelot.js analyse -m examples/month-batches.json --hours 480
node bin/shadelot.js library -s examples/standard-olive.json --dips examples/dip-library.json
node bin/shadelot.js reuse -w examples/works.json --previous examples/recipe-olive.json --next examples/recipe-olive-deep.json
node bin/shadelot.js standards -s examples/standards.json --today 2025-05-01 --limit 20
node bin/shadelot.js finish -c examples/cloth-panel.json --handle 3.5
node bin/shadelot.js doctor -w examples/works.json -r examples/recipe-olive.json -s examples/stock.json
node bin/shadelot.js works -w examples/works.json
```

Starting from nothing, `shadelot init -w works.json` writes a works file every
command will accept, and refuses to write over one that is already there.

## The works file

One file describes the plant: the dyes it stocks, the chemicals and how each one
is dosed, the machines with their load bands and dead volumes, the named
tolerance blocks, the utility tariff and the discharge consent. Every command
reads it, so a machine added once is added everywhere. `shadelot works` prints
what a given file actually says, which answers most questions faster than reading
the json.

## The parts of it

| area            | what it holds                                                           |
| --------------- | ----------------------------------------------------------------------- |
| `src/measure`   | units, roll geometry, and rounding to a balance the dispensary owns     |
| `src/greige`    | rolls, lot forming, the goods inwards register, shrinkage allowances    |
| `src/dyestuff`  | the catalogue, strengths, and grading a substitution                    |
| `src/chemical`  | auxiliaries and the basis each is dosed on                              |
| `src/recipe`    | recipes, depth bands, the dispensing card, the recipe library           |
| `src/machine`   | the machine register and its availability calendar                      |
| `src/batch`     | putting lots on a machine and re-dosing for the ratio it gives          |
| `src/process`   | dyeing profiles, exhaustion and fixation, pad batch                     |
| `src/colour`    | Lab, four difference formulae, tolerance blocks, reflectance, whiteness |
| `src/labdip`    | lab dip submissions and the library of past ones                        |
| `src/shade`     | the correction decision and shade continuity across an order            |
| `src/schedule`  | ordering a day light to dark and costing the changeovers                |
| `src/utility`   | water and energy accounting                                             |
| `src/cost`      | costing a batch per saleable kilogram                                   |
| `src/effluent`  | the daily load against the discharge consent                            |
| `src/inventory` | dyestuff and chemical stock, held in lots                               |
| `src/quality`   | four point defect grading                                               |
| `src/order`     | customer orders and deliveries                                          |
| `src/invoice`   | rate cards and invoicing                                                |
| `src/analysis`  | the month, and splitting a variance                                     |
| `src/audit`     | the append only trail                                                   |
| `src/store`     | the json file and the repository over it                                |
| `src/report`    | number formatting and table rendering                                   |
| `src/cli`       | the command line                                                        |

## A few decisions worth knowing about

**The card is scaled before it is rounded.** Rounding a percentage means nothing.
The old spreadsheet did it the other way round and the cards were wrong on every
small load.

**Grams per litre and percent on weight are not interchangeable.** One scales
with the cloth and the other with the bath, so a batch moved to a machine that
gives a different liquor ratio has to have its grams per litre lines re-dosed.
`shadelot plan` says on its face when it has done that.

**A tolerance is a block, not one number.** A whole unit of hue inside a one unit
total is a visible miss. Every axis is checked as well as the total.

**An order is judged twice.** Against the customer standard, and against the
first batch that was accepted on it, under a tighter limit. Six batches each half
a unit off the standard in six directions all pass the first test and make an
unwearable garment.

**Exit codes are an interface.** A works runs this out of cron. The codes are
pinned in `src/cli/exit.js` and the message text is not.

**A standard is never edited.** A customer standard is a piece of cloth in a
drawer and it fades. Re-measuring adds a reading; the drift between the first
and the last is what tells you whether to still trust it.

**Filling every machine to the top is the wrong objective.** It gives the best
fill factor and the worst liquor ratios. `shadelot loadout` scores both and lets
the works weight them.

**A bath can be reused going darker inside one family, and only then.** It
carries the last shade forward, so `shadelot reuse` prints the saving next to the
verdict: a refusal with no number against it gets overruled at eleven at night.

**Every command validates one file; `doctor` reads several together.** A recipe
naming a dye the works dropped last month is two individually correct files that
disagree, and nothing else here would notice.

**An export defuses the cells a spreadsheet would run.** A shade name starting
with an equals sign is a formula to a spreadsheet and text to everybody else, so
`shadelot export` prefixes it. That one is a security hole rather than a mess.

**Treatment is prescribed from what is actually over.** Coagulation drops the
colour, biological treatment drops the demand, and a works that buys the wrong
one has a large tank that fixes the wrong number.

## Where to start reading

[docs/a-batch-end-to-end.md](docs/a-batch-end-to-end.md) follows one batch through
the whole program in the order the floor takes it, naming the module that does
each piece of arithmetic and the command that prints it.

[docs/when-a-batch-goes-wrong.md](docs/when-a-batch-goes-wrong.md) is the other
half: which commands to run, in which order, for the four things that actually
go wrong.

## Testing

```
npm run check
```

runs lint, the format check, the whole suite, the smoke test and the release
check. `npm run audit` is separate because it needs the network: it fails on an
advisory in the production tree and says so loudly when it could not reach the
registry, rather than treating an outage as a clean bill of health. The smoke test
drives the shipped binary rather than importing the source, because everything
else imports the source and would not notice a broken entry point.

`tests/integration/a-week-in-the-dyehouse.test.js` runs a week through the
modules in the order the floor runs them. It is there for the failures that only
appear where two modules meet.

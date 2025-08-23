# When a batch goes wrong

The commands to run and the order to run them in, for the four things that
actually happen. Every one of them ends with a decision somebody has to make;
none of them makes it for you.

## The batch came out off shade

Run `shadelot shade` first, against the customer's own block if there is one in
the works file. Read the axis table rather than the total: a batch a whole unit
out in hue is a different problem from one a whole unit out in lightness, and
only one of them can be corrected by adding dye.

Then `shadelot correct`, with the measured colour strength if the lab has one.
It prints the action and the rule that decided, so an argument has something to
be about. If it says add on and you give it the recipe and the load, it prints
the dose per dye.

If it says strip and redye twice on the same shade, stop and run
`shadelot standards`. A standard that has faded takes every batch with it, and a
works chasing a moving standard will strip cloth all week.

## The batches are each fine and the delivery is not

This is the one that reaches the customer. Run `shadelot order`. It judges each
batch against the standard and against the first accepted batch on the order,
under a tighter limit. A delivery where every batch passes the first test and
half fail the second is a delivery that makes an unwearable garment.

If the run is drifting rather than scattering, feed the differences to
`shadelot analyse` and read the control chart. A drift and a wobble need
different answers and both get called the shade wandering.

## The customer says it stains, or the colour comes off

Read the fixation first, not the wash off. `src/process/exhaust.js` says how much
of the dye ever bonded, and `src/process/wash.js` says how many baths it takes to
get the rest off from wherever the fixation left it. Adding a bath to a batch
that fixed at half is treating the symptom with water.

If the fixation was normal, count the baths that were actually run. The plan
`shadelot` prints is not always the plan the shift ran.

## The month came in over budget

`shadelot analyse` in this order: the four numbers, then the split by machine,
then the benchmark table, then the pareto.

The two cuts of the pareto are the part worth reading. Failures counted by batch
and by kilogram give different answers whenever the big batches fail for a
different reason from the small ones, and a works that only ever looks at the
first spends its year on the wrong machine.

If the benchmark says the works is behind on water, run `shadelot reuse` on the
shade sequences it actually runs and `shadelot effluent --treat` on a heavy day.
One of those is free and the other is a tank.

## What not to do

Do not change a recipe because one batch failed. The recipe is not what changed.

Do not widen a tolerance to make a batch pass. Write the customer's block down in
the works file and let the command say what it says.

Do not read a right first time number that was counted by batch. Count it by
weight as well; the gap between the two is the interesting number.

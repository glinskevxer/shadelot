# A batch, end to end

This is the path one batch takes through the program, in the order the floor
takes it. Every step names the module that does the arithmetic and the command
that prints it.

## 1. The cloth arrives

Rolls come in on a docket. `src/greige/roll.js` keeps both the docket weight and
the weighed weight, because the customer is invoiced on one and the recipe is
dosed on the other. `src/greige/register.js` records the movement; nothing is
ever deleted from it.

`src/greige/lot.js` decides what may share a dye lot. Two rolls of the same
quality off different warp beams take dye differently, so the beam is part of
the compatibility key and `src/greige/beam.js` grades the barre risk.

## 2. The shade is matched

An enquiry arrives as a customer standard. `shadelot library` looks for work
already done against something like it, on the standard rather than on the dip,
because a standard is what the enquiry carries.

If there is nothing close, the lab dips. `shadelot dip` judges each round as it
lands and names the closest, and the losing dips are kept: the next enquiry
starts from whichever one came nearest.

## 3. The card is written

`shadelot card` scales the recipe onto the load and then rounds each line to a
balance the dispensary owns. That order matters. Rounding a percentage means
nothing.

The salt and the alkali are not on the recipe. They come off the depth band in
`src/recipe/depth.js`, scaled to the liquor ratio the bath will really run at.

## 4. It goes on a machine

`shadelot loadout` puts the day's lots on the machines that are free. Filling
every machine to its maximum gives the best fill factor and the worst liquor
ratios, so the score weighs both.

`shadelot plan` puts one lot on one machine and says what the machine will
really run at. If the ratio differs from what the recipe asked for, the grams
per litre lines are re-dosed and the command says so on its face.

`shadelot sequence` orders the day light to dark and costs the changeovers,
which `src/machine/changeover.js` prices as recipes of their own.

## 5. It runs

`shadelot run-sheet` prints the profile with the clock worked off the ramp
rates. `src/process/exhaust.js` says how much of the dye will reach the cloth
and how much will not, and `src/process/wash.js` says how many baths it takes to
get the rest off.

## 6. It is judged

`shadelot shade` judges the reading against the standard on every axis, not just
the total. `shadelot metamerism` reads the pair under all three lamps, because a
match that only holds in daylight comes back.

`shadelot correct` runs the correction rules and says what to do with a batch
that failed, and which rule decided.

`shadelot order` judges the batch against the first accepted one as well as
against the standard. Six batches each half a unit off the standard in six
directions all pass the first test and make an unwearable garment.

## 7. It is graded and packed

`shadelot quality` grades the roll on the four point system and splits the
points by cause, because the weaver disputes that split every time.

`shadelot despatch` packs the delivery under the customer's own baling rule and
checks its own packing, since nobody catches this one until the cloth arrives at
the other end.

## 8. It is paid for and counted

`shadelot cost` prices the batch per saleable kilogram. A batch dyed twice costs
twice and yields once.

`shadelot effluent` totals the day against the discharge consent and leaves with
its own exit code, because the works runs it out of cron at the end of a shift.

`shadelot analyse` is the end of the month: the four numbers, the split, the
pareto of the failures, the control chart on the shade, and where the works sits
against the published trade bands.

## What is written down

Every decision the program makes on its own goes on the trail in
`src/audit/trail.js`, with the inputs that produced it. It is append only. A
customer asking why their batch came out the way it did is asking about a
sequence of decisions, most of which were made by somebody who has gone home.

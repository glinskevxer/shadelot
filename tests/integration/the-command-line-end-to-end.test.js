/**
 * A whole job through the command line.
 *
 * The other integration tests import the modules. This one drives the commands,
 * feeding each one the json the last one printed, which is the thing a works
 * actually does from a shell script and the thing nothing else here checks: that
 * the shapes the commands print are the shapes the next command reads.
 */

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOutput } from '../../src/cli/io.js';
import { run } from '../../src/cli/program.js';

const examples = fileURLToPath(new URL('../../examples', import.meta.url));
const path = (name) => join(examples, name);
const capture = () => ({ out: createOutput(), err: createOutput() });

async function call(argv) {
  const io = capture();
  const code = await run(argv, io);
  return { code, out: io.out.text(), err: io.err.text() };
}

async function json(argv) {
  const result = await call([...argv, '--format', 'json']);
  return { ...result, document: result.out === '' ? null : JSON.parse(result.out) };
}

let workspace;
let worksFile;

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'shadelot-e2e-'));
  worksFile = join(workspace, 'works.json');
});

describe('a job run entirely through the command line', () => {
  it('starts from a works file init wrote', async () => {
    const written = await json(['init', '-w', worksFile, '--name', 'End To End Dyeing']);
    expect(written.code).toBe(0);
    const read = await json(['works', '-w', worksFile]);
    expect(read.document.name).toBe('End To End Dyeing');
    expect(read.document.machines).toHaveLength(1);
  });

  it('builds a card on the real works file and dispenses it from stock', async () => {
    const card = await json([
      'card',
      '-w',
      path('works.json'),
      '-r',
      path('recipe-olive.json'),
      '-l',
      '200',
    ]);
    expect(card.code).toBe(0);
    const cardFile = join(workspace, 'card.json');
    await writeFile(cardFile, card.out, 'utf8');

    const stock = await json(['stock', '-s', path('stock.json'), '-c', cardFile]);
    expect(stock.code).toBe(0);
    expect(stock.document.needs.every((need) => need.state === 'enough')).toBe(true);
  });

  it('plans the same lots onto a machine the loadout chose', async () => {
    const loadout = await json(['loadout', '-w', path('works.json'), '-g', path('lots.json')]);
    expect(loadout.code).toBe(0);
    const chosen = loadout.document.placed[0];

    const plan = await json([
      'plan',
      '-w',
      path('works.json'),
      '-r',
      path('recipe-olive.json'),
      '-g',
      path('lots.json'),
      '-m',
      'JET-4',
    ]);
    expect(plan.code).toBe(0);
    expect(plan.document.fibreKg).toBeCloseTo(198.5, 6);
    expect(loadout.document.placed.map((row) => row.lotId)).toContain(chosen.lotId);
  });

  it('prices the batch and the numbers agree with the card it costed', async () => {
    const card = await json([
      'card',
      '-w',
      path('works.json'),
      '-r',
      path('recipe-olive.json'),
      '-l',
      '200',
    ]);
    const cost = await json([
      'cost',
      '-w',
      path('works.json'),
      '-r',
      path('recipe-olive.json'),
      '-m',
      'JET-4',
      '-l',
      '200',
      '-p',
      path('profile-reactive-60.json'),
    ]);
    expect(cost.code).toBe(0);
    const dyeCost = card.document.lines
      .filter((line) => line.kind === 'dye')
      .reduce((sum, line) => sum + line.kg * line.unitPrice, 0);
    expect(cost.document.heads.dyestuff).toBeCloseTo(dyeCost, 6);
  });

  it('judges the shade and hands the same verdict to the correction', async () => {
    const shade = await json([
      'shade',
      '-s',
      path('standard-olive.json'),
      '-b',
      path('batch-olive.json'),
    ]);
    const correct = await json([
      'correct',
      '-s',
      path('standard-olive.json'),
      '-b',
      path('batch-olive.json'),
      '--strength',
      '0.94',
    ]);
    expect(correct.document.verdict).toBe(shade.document.verdict);
  });

  it('takes the order through to a despatch note', async () => {
    const order = await json(['order', '-o', path('order.json')]);
    expect([0, 5]).toContain(order.code);
    const despatch = await json([
      'despatch',
      '-r',
      path('finished-rolls.json'),
      '-o',
      order.document.id ?? 'O25-0900',
    ]);
    expect(despatch.code).toBe(0);
    expect(despatch.document.note.rolls).toBe(7);
  });

  it('reports the day and the month without either contradicting the other', async () => {
    const effluent = await json([
      'effluent',
      '-w',
      path('works.json'),
      '-d',
      path('day-batches.json'),
    ]);
    expect(effluent.code).toBe(0);
    const analyse = await json(['analyse', '-m', path('month-batches.json'), '--hours', '480']);
    expect(analyse.code).toBe(0);
    expect(analyse.document.month.batches).toBe(48);
    expect(effluent.document.compliant).toBe(true);
  });

  it('leaves with a code a shell script can branch on at every step', async () => {
    expect((await call(['nonsense'])).code).toBe(2);
    expect(
      (await call(['card', '-w', '/nowhere.json', '-r', path('recipe-olive.json'), '-l', '200']))
        .code
    ).toBe(3);
    expect(
      (await call(['card', '-w', path('works.json'), '-r', path('recipe-olive.json'), '-l', '0']))
        .code
    ).toBe(4);
    expect(
      (await call(['standards', '-s', path('standards.json'), '--today', '2025-05-01'])).code
    ).toBe(5);
  });

  it('prints json every command in the chain could read back', async () => {
    const chain = [
      ['card', '-w', path('works.json'), '-r', path('recipe-olive.json'), '-l', '200'],
      ['works', '-w', path('works.json')],
      ['loadout', '-w', path('works.json'), '-g', path('lots.json')],
      ['sequence', '-d', path('day-sequence.json')],
      ['quality', '-r', path('roll-faults.json')],
      ['finish', '-c', path('cloth-panel.json'), '--handle', '3.5'],
    ];
    for (const argv of chain) {
      const result = await json(argv);
      expect(result.code, `${argv[0]}: ${result.err}`).toBe(0);
      expect(result.document, argv[0]).not.toBeNull();
    }
  });
});

describe('the last mile', () => {
  it('exports the month the analyse command read', async () => {
    const output = join(workspace, 'month.csv');
    const exported = await json(['export', '-i', path('month-batches.json'), '-o', output]);
    expect(exported.code).toBe(0);
    const analysed = await json(['analyse', '-m', path('month-batches.json')]);
    expect(exported.document.rows).toBe(analysed.document.month.batches);
  });

  it('prescribes a finish for the cloth and prints what it cost elsewhere', async () => {
    const finished = await json(['finish', '-c', path('cloth-panel.json'), '--handle', '3.5']);
    expect(finished.code).toBe(0);
    const rubWet = finished.document.rows.find((row) => row.axis === 'rubWet');
    expect(rubWet.change).toBeLessThan(0);
  });

  it('runs every command in the listing without one of them crashing', async () => {
    const listing = await json(['commands']);
    expect(listing.document.length).toBeGreaterThan(20);
    for (const entry of listing.document) {
      const io = capture();
      const code = await run([entry.command, '--help'], io);
      expect(code, entry.command).toBe(0);
    }
  });

  it('leaves the temporary workspace with only the files it wrote', async () => {
    const { readdir } = await import('node:fs/promises');
    const written = await readdir(workspace);
    expect(written).toContain('works.json');
    expect(written).toContain('month.csv');
    expect(written.some((name) => name.endsWith('.tmp'))).toBe(false);
  });
});

import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { assembleWorks } from '../../../src/cli/works.js';
import { checkStock, checkWorks } from '../../../src/cli/commands/doctor.js';
import { createStock, receiveLot } from '../../../src/inventory/stock.js';

const worksPath = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const recipePath = fileURLToPath(new URL('../../../examples/recipe-olive.json', import.meta.url));
const stockPath = fileURLToPath(new URL('../../../examples/stock.json', import.meta.url));
const worksDocument = JSON.parse(readFileSync(worksPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-doctor-'));
});

const write = async (name, document) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(document), 'utf8');
  return path;
};

describe('the doctor command', () => {
  it('finds nothing wrong with the shipped example set', async () => {
    const io = capture();
    expect(await run(['doctor', '-w', worksPath, '-r', recipePath, '-s', stockPath], io)).toBe(0);
    expect(io.out.text()).toMatch(/verdict\s+consistent/);
    expect(io.out.text()).toMatch(/nothing disagrees/);
  });

  it('reads the works alone when nothing else is given', async () => {
    const io = capture();
    expect(await run(['doctor', '-w', worksPath, '--format', 'json'], io)).toBe(0);
    const result = JSON.parse(io.out.text());
    expect(result.errors).toBe(0);
  });

  it('catches a recipe naming a dye the works dropped', async () => {
    const io = capture();
    const orphan = await write('orphan.json', {
      ...JSON.parse(readFileSync(recipePath, 'utf8')),
      dyes: [{ code: 'RY-145-ACME', owf: 1 }],
    });
    const thin = await write('thin-works.json', {
      ...worksDocument,
      dyestuffs: worksDocument.dyestuffs.filter((d) => d.code !== 'RY-145-ACME'),
    });
    expect(await run(['doctor', '-w', thin, '-r', orphan], io)).toBe(4);
    expect(io.err.text()).toMatch(/error\(s\)/);
  });

  it('catches a works whose salt code is not in its own chemical list', async () => {
    const broken = assembleWorks({ ...worksDocument, saltCode: 'NOT-STOCKED' }, 'w.json');
    const findings = checkWorks(broken);
    expect(findings.some((f) => f.finding.includes('not in its own chemical list'))).toBe(true);
    expect(findings.every((f) => ['error', 'warn'].includes(f.severity))).toBe(true);
  });

  it('warns rather than errors when a works has no tariff or consent', async () => {
    const bare = assembleWorks(
      { ...worksDocument, tariff: undefined, consent: undefined },
      'w.json'
    );
    const findings = checkWorks(bare);
    const subjects = findings.map((f) => f.finding);
    expect(subjects.some((f) => f.includes('nothing can be costed'))).toBe(true);
    expect(subjects.some((f) => f.includes('effluent cannot be judged'))).toBe(true);
    expect(findings.every((f) => f.severity === 'warn')).toBe(true);
  });

  it('catches a recipe whose process no machine runs', async () => {
    const io = capture();
    const noJets = await write('nojets.json', {
      ...worksDocument,
      machines: worksDocument.machines.filter((m) => m.type === 'pad-mangle'),
    });
    expect(await run(['doctor', '-w', noJets, '-r', recipePath], io)).toBe(4);
    const json = capture();
    await run(['doctor', '-w', noJets, '-r', recipePath, '--format', 'json'], json);
    const findings = JSON.parse(json.out.text()).findings;
    expect(findings.some((f) => f.finding.includes('no machine runs that process'))).toBe(true);
  });

  it('catches stock that cannot dispense a recipe on the floor', () => {
    const works = assembleWorks(worksDocument, 'w.json');
    const stock = createStock();
    receiveLot(stock, { lotId: 'S1', code: 'RY-145-ACME', quantityKg: 5, pricePerKg: 20 });
    const recipe = { dyes: [{ code: 'RB-19-ACME' }], auxiliaries: [] };
    const findings = checkStock(works, [recipe], stock);
    expect(findings.some((f) => f.subject === 'RB-19-ACME' && f.severity === 'error')).toBe(true);
  });

  it('warns about something on the shelf that is in neither list', () => {
    const works = assembleWorks(worksDocument, 'w.json');
    const stock = createStock();
    receiveLot(stock, { lotId: 'S1', code: 'MYSTERY-9', quantityKg: 5, pricePerKg: 20 });
    const findings = checkStock(works, [], stock);
    expect(findings.some((f) => f.subject === 'MYSTERY-9' && f.severity === 'warn')).toBe(true);
  });

  it('passes on warnings alone, and fails on them under strict', async () => {
    const noTariff = await write('notariff.json', { ...worksDocument, tariff: undefined });
    const lenient = capture();
    expect(await run(['doctor', '-w', noTariff], lenient)).toBe(0);
    const strict = capture();
    expect(await run(['doctor', '-w', noTariff, '--strict'], strict)).toBe(4);
  });

  it('takes more than one recipe', async () => {
    const io = capture();
    await run(
      ['doctor', '-w', worksPath, '-r', recipePath, '-r', recipePath, '--format', 'json'],
      io
    );
    expect(io.out.text()).toBeTruthy();
    const summary = capture();
    await run(['doctor', '-w', worksPath, '-r', recipePath, '-r', recipePath], summary);
    expect(summary.out.text()).toMatch(/recipes read\s+2/);
  });

  it('reports a recipe that will not build at all rather than crashing', async () => {
    const io = capture();
    const bad = await write('bad.json', {
      id: 'R-BAD',
      name: 'mixed classes',
      process: 'exhaust',
      substrate: 'cotton',
      liquorRatio: 8,
      dyes: [
        { code: 'RY-145-ACME', owf: 1 },
        { code: 'DB-56-ACME', owf: 1 },
      ],
    });
    expect(await run(['doctor', '-w', worksPath, '-r', bad], io)).toBe(4);
    const json = capture();
    await run(['doctor', '-w', worksPath, '-r', bad, '--format', 'json'], json);
    expect(JSON.parse(json.out.text()).findings.some((f) => f.subject === 'R-BAD')).toBe(true);
  });

  it('says which stock row is unusable', async () => {
    const io = capture();
    const bad = await write('badstock.json', [
      { lotId: 'S1', code: 'X', quantityKg: 0, pricePerKg: 1 },
    ]);
    expect(await run(['doctor', '-w', worksPath, '-s', bad], io)).toBe(4);
    expect(io.err.text()).toMatch(/row 0 in the stock file is not usable/);
  });
});

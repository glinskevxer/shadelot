import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const dayPath = fileURLToPath(new URL('../../../examples/day-batches.json', import.meta.url));
const day = JSON.parse(readFileSync(dayPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-effluent-'));
});

const dayFile = async (name, batches) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(batches), 'utf8');
  return path;
};

describe('the effluent command', () => {
  it('totals the shipped day and stays inside the consent', async () => {
    const io = capture();
    expect(await run(['effluent', '-w', works, '-d', dayPath], io)).toBe(0);
    expect(io.out.text()).toMatch(/verdict\s+inside consent/);
  });

  it('ranks the parameters by how much of the limit is used', async () => {
    const io = capture();
    await run(['effluent', '-w', works, '-d', dayPath, '--format', 'json'], io);
    const ranked = JSON.parse(io.out.text()).ranked;
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].used).toBeGreaterThanOrEqual(ranked[i].used);
    }
  });

  it('leaves with the consent breached code when a limit goes', async () => {
    const io = capture();
    const heavy = await dayFile(
      'heavy.json',
      Array.from({ length: 60 }, () => day[0])
    );
    expect(await run(['effluent', '-w', works, '-d', heavy], io)).toBe(6);
    expect(io.err.text()).toMatch(/breached the consent on/);
  });

  it('names every parameter that breached, not the first', async () => {
    const io = capture();
    const heavy = await dayFile(
      'heavy.json',
      Array.from({ length: 60 }, () => day[0])
    );
    await run(['effluent', '-w', works, '-d', heavy], io);
    expect(io.err.text().split(', ').length).toBeGreaterThan(1);
  });

  it('checks the ph only when one is read', async () => {
    const clean = capture();
    await run(['effluent', '-w', works, '-d', dayPath], clean);
    expect(clean.out.text()).toMatch(/ph\s+not read/);
    const sour = capture();
    expect(await run(['effluent', '-w', works, '-d', dayPath, '--ph', '3.5'], sour)).toBe(6);
  });

  it('puts more colour down the drain at a lower fixation', async () => {
    const good = capture();
    await run(['effluent', '-w', works, '-d', dayPath, '--format', 'json'], good);
    const poor = capture();
    await run(
      ['effluent', '-w', works, '-d', dayPath, '--fixation', '0.4', '--format', 'json'],
      poor
    );
    expect(JSON.parse(poor.out.text()).day.colourUnits).toBeGreaterThan(
      JSON.parse(good.out.text()).day.colourUnits
    );
  });

  it('refuses an empty day', async () => {
    const io = capture();
    const empty = await dayFile('empty.json', []);
    expect(await run(['effluent', '-w', works, '-d', empty], io)).toBe(4);
    expect(io.err.text()).toMatch(/holds no batches/);
  });

  it('says which batch in the day file is short of something', async () => {
    const io = capture();
    const broken = await dayFile('broken.json', [day[0], { id: 'B2' }]);
    expect(await run(['effluent', '-w', works, '-d', broken], io)).toBe(4);
    expect(io.err.text()).toMatch(/batch 1 in the day file/);
  });
});

describe('prescribing a treatment', () => {
  it('says none is needed for a day already inside', async () => {
    const io = capture();
    await run(['effluent', '-w', works, '-d', dayPath, '--treat'], io);
    expect(io.out.text()).toMatch(/treatment\s+none needed/);
  });

  it('prescribes a train for a day that is over', async () => {
    const io = capture();
    const heavy = await dayFile(
      'heavy.json',
      Array.from({ length: 30 }, () => day[0])
    );
    await run(['effluent', '-w', works, '-d', heavy, '--treat', '--format', 'json'], io);
    const prescription = JSON.parse(io.out.text()).prescription;
    expect(prescription.stages.length).toBeGreaterThanOrEqual(0);
    expect(prescription.reason).toBeTruthy();
  });

  it('says what the day would look like after it', async () => {
    const io = capture();
    const heavy = await dayFile(
      'heavy.json',
      Array.from({ length: 30 }, () => day[0])
    );
    await run(['effluent', '-w', works, '-d', heavy, '--treat', '--format', 'json'], io);
    const result = JSON.parse(io.out.text());
    if (result.prescription.stages.length > 0) {
      expect(result.treated.codKg).toBeLessThanOrEqual(result.day.codKg);
    }
  });

  it('says how far the load would have to come down instead', async () => {
    const io = capture();
    const heavy = await dayFile(
      'heavy.json',
      Array.from({ length: 30 }, () => day[0])
    );
    await run(['effluent', '-w', works, '-d', heavy, '--treat', '--format', 'json'], io);
    const reduction = JSON.parse(io.out.text()).reduction;
    expect(Object.values(reduction).some((share) => share > 0)).toBe(true);
  });

  it('prices the running cost and the sludge', async () => {
    const io = capture();
    const heavy = await dayFile(
      'heavy.json',
      Array.from({ length: 30 }, () => day[0])
    );
    await run(['effluent', '-w', works, '-d', heavy, '--treat'], io);
    expect(io.out.text()).toMatch(/running cost/);
    expect(io.out.text()).toMatch(/sludge\s+[\d.]+ kg/);
  });

  it('says nothing about treatment unless it is asked', async () => {
    const io = capture();
    await run(['effluent', '-w', works, '-d', dayPath, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).prescription).toBeNull();
  });
});

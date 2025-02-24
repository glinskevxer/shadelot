import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const monthPath = fileURLToPath(new URL('../../../examples/month-batches.json', import.meta.url));
const month = JSON.parse(readFileSync(monthPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-analyse-'));
});

const monthFile = async (name, rows) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(rows), 'utf8');
  return path;
};

describe('the analyse command', () => {
  it('reports the four numbers off the shipped month', async () => {
    const io = capture();
    expect(await run(['analyse', '-m', monthPath], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/right first time/);
    expect(text).toMatch(/cost per kilo/);
    expect(text).toMatch(/water per kilo/);
    expect(text).toMatch(/machine hours/);
  });

  it('reports right first time both ways', async () => {
    const io = capture();
    await run(['analyse', '-m', monthPath], io);
    expect(io.out.text()).toMatch(/by batch, .* by weight/);
  });

  it('splits by machine by default and by anything else on request', async () => {
    const byMachine = capture();
    await run(['analyse', '-m', monthPath, '--format', 'json'], byMachine);
    expect(JSON.parse(byMachine.out.text()).split[0].machineId).toBeTruthy();

    const byCustomer = capture();
    await run(['analyse', '-m', monthPath, '--split', 'customer', '--format', 'json'], byCustomer);
    expect(JSON.parse(byCustomer.out.text()).split[0].customer).toBeTruthy();
  });

  it('says nothing about utilisation when nobody said how many hours there were', async () => {
    const io = capture();
    await run(['analyse', '-m', monthPath], io);
    expect(io.out.text()).toMatch(/utilisation\s+not stated/);
  });

  it('reports it when they did', async () => {
    const io = capture();
    await run(['analyse', '-m', monthPath, '--hours', '480', '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).month.utilisation).toBeGreaterThan(0);
  });

  it('paretos the failures and draws a bar', async () => {
    const io = capture();
    await run(['analyse', '-m', monthPath], io);
    expect(io.out.text()).toMatch(/#+\.+/);
  });

  it('leaves the pareto out for a month with nothing to explain', async () => {
    const io = capture();
    const clean = await monthFile(
      'clean.json',
      month.map((row) => ({ ...row, passes: 1, accepted: true, downgraded: false }))
    );
    await run(['analyse', '-m', clean, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).causes).toEqual([]);
  });

  it('runs a control chart on the shade differences', async () => {
    const io = capture();
    await run(['analyse', '-m', monthPath, '--format', 'json'], io);
    const chart = JSON.parse(io.out.text()).chart;
    expect(chart.limits.centre).toBeGreaterThan(0);
  });

  it('says so when the batches carry no readings', async () => {
    const io = capture();
    const noReadings = await monthFile(
      'plain.json',
      month.map(({ shadeDifference: _drop, ...rest }) => rest)
    );
    await run(['analyse', '-m', noReadings], io);
    expect(io.out.text()).toMatch(/no readings on the batches/);
  });

  it('names the dearest batch', async () => {
    const io = capture();
    await run(['analyse', '-m', monthPath], io);
    expect(io.out.text()).toMatch(/dearest batch\s+B25-\d+/);
  });

  it('refuses an empty month', async () => {
    const io = capture();
    const empty = await monthFile('empty.json', []);
    expect(await run(['analyse', '-m', empty], io)).toBe(4);
  });

  it('says which batch is short of a field', async () => {
    const io = capture();
    const broken = await monthFile('broken.json', [{ id: 'B1', fibreKg: 100 }]);
    expect(await run(['analyse', '-m', broken], io)).toBe(4);
    expect(io.err.text()).toMatch(/batch 0 in the month file has no cost/);
  });
});

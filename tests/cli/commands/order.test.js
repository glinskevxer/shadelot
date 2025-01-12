import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';

const works = fileURLToPath(new URL('../../../examples/works.json', import.meta.url));
const orderPath = fileURLToPath(new URL('../../../examples/order.json', import.meta.url));
const order = JSON.parse(readFileSync(orderPath, 'utf8'));
const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-order-'));
});

const orderFile = async (name, document) => {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(document), 'utf8');
  return path;
};

describe('the order command', () => {
  it('totals what has been delivered against the shipped order', async () => {
    const io = capture();
    expect(await run(['order', '-o', orderPath], io)).toBe(0);
    const text = io.out.text();
    expect(text).toMatch(/ordered\s+6000 m/);
    expect(text).toMatch(/delivered\s+4487 m over 3 batches/);
    expect(text).toMatch(/outstanding\s+1513 m/);
  });

  it('judges each batch against the standard and the first accepted one', async () => {
    const io = capture();
    await run(['order', '-o', orderPath, '--format', 'json'], io);
    const rows = JSON.parse(io.out.text()).deliveries;
    expect(rows[0].againstReference).toBeNull();
    expect(rows[1].againstReference).toBeGreaterThan(0);
  });

  it('reports the shade band of the accepted batches', async () => {
    const io = capture();
    await run(['order', '-o', orderPath, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).band.count).toBe(3);
  });

  it('flags a batch that is on shade against the standard and off the run', async () => {
    const io = capture();
    const drifting = await orderFile('drift.json', {
      ...order,
      deliveries: [
        { batchId: 'B1', metres: 1000, reading: { L: 51.5, a: -14.3, b: 22.7 } },
        { batchId: 'B2', metres: 1000, reading: { L: 52.9, a: -14.3, b: 22.7 } },
      ],
    });
    expect(await run(['order', '-o', drifting, '--format', 'json'], io)).toBe(5);
    const rows = JSON.parse(io.out.text()).deliveries;
    expect(rows[1].state).toBe('off the run');
  });

  it('leaves with the out of tolerance code and names the batches', async () => {
    const io = capture();
    const bad = await orderFile('bad.json', {
      ...order,
      deliveries: [
        { batchId: 'B1', metres: 1000, reading: { L: 52.2, a: -14.3, b: 22.7 } },
        { batchId: 'B2', metres: 1000, reading: { L: 58, a: -10, b: 26 } },
      ],
    });
    expect(await run(['order', '-o', bad], io)).toBe(5);
    expect(io.err.text()).toMatch(/B2/);
  });

  it('does not count a rejected batch towards the delivery', async () => {
    const io = capture();
    const bad = await orderFile('bad.json', {
      ...order,
      deliveries: [
        { batchId: 'B1', metres: 1000, reading: { L: 52.2, a: -14.3, b: 22.7 } },
        { batchId: 'B2', metres: 1000, reading: { L: 58, a: -10, b: 26 } },
      ],
    });
    await run(['order', '-o', bad, '--format', 'json'], io);
    expect(JSON.parse(io.out.text()).delivered).toBe(1000);
  });

  it('takes an order with nothing delivered yet', async () => {
    const io = capture();
    const fresh = await orderFile('fresh.json', { ...order, deliveries: [] });
    expect(await run(['order', '-o', fresh, '--format', 'json'], io)).toBe(0);
    const status = JSON.parse(io.out.text());
    expect(status.delivered).toBe(0);
    expect(status.band).toBeNull();
  });

  it('judges under a named works block', async () => {
    const io = capture();
    await run(['order', '-o', orderPath, '-w', works, '-t', 'workwear'], io);
    expect(io.out.text()).toMatch(/complete/);
  });

  it('needs the works file for a named block', async () => {
    const io = capture();
    expect(await run(['order', '-o', orderPath, '-t', 'workwear'], io)).toBe(4);
  });

  it('says which delivery has no batch against it', async () => {
    const io = capture();
    const broken = await orderFile('broken.json', {
      ...order,
      deliveries: [{ metres: 100, reading: { L: 52, a: -14, b: 22 } }],
    });
    expect(await run(['order', '-o', broken], io)).toBe(4);
    expect(io.err.text()).toMatch(/delivery 0 in the order file has no batch/);
  });
});

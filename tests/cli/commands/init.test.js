import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createOutput } from '../../../src/cli/io.js';
import { run } from '../../../src/cli/program.js';
import { starterWorks } from '../../../src/cli/commands/init.js';
import { assembleWorks } from '../../../src/cli/works.js';
import { checkShape, fieldsFor } from '../../../src/valid/schema.js';

const capture = () => ({ out: createOutput(), err: createOutput() });

let directory;
let path;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-init-'));
  path = join(directory, 'works.json');
});

describe('the starter itself', () => {
  it('passes the works shape', () => {
    expect(checkShape(starterWorks(), fieldsFor('works'))).toEqual([]);
  });

  it('assembles into a usable works', () => {
    const works = assembleWorks(starterWorks(), 'starter');
    expect(works.machines.size).toBe(1);
    expect(works.catalogue.size).toBe(3);
  });

  it('names an electrolyte pair that is actually in its own chemical list', () => {
    const document = starterWorks();
    const codes = document.chemicals.map((chemical) => chemical.code);
    expect(codes).toContain(document.saltCode);
    expect(codes).toContain(document.alkaliCode);
  });

  it('carries a tariff and a consent so the costing commands run', () => {
    const works = assembleWorks(starterWorks(), 'starter');
    expect(works.tariff).toBeTruthy();
    expect(works.consent).toBeTruthy();
  });

  it('takes a name for the works', () => {
    expect(starterWorks({ name: 'Redgate' }).name).toBe('Redgate');
  });
});

describe('the init command', () => {
  it('writes a file that the works command can read straight back', async () => {
    const io = capture();
    expect(await run(['init', '-w', path], io)).toBe(0);
    const back = capture();
    expect(await run(['works', '-w', path], back)).toBe(0);
    expect(back.out.text()).toMatch(/machines\s+1/);
  });

  it('says what it wrote and what to do next', async () => {
    const io = capture();
    await run(['init', '-w', path], io);
    expect(io.out.text()).toMatch(/written\s+/);
    expect(io.out.text()).toMatch(/now edit it/);
    expect(io.out.text()).toMatch(/shadelot works -w/);
  });

  it('lists the values the file will accept', async () => {
    const io = capture();
    await run(['init', '-w', path], io);
    expect(io.out.text()).toMatch(/reactive, disperse/);
    expect(io.out.text()).toMatch(/jet, winch/);
  });

  it('takes the name it is given', async () => {
    const io = capture();
    await run(['init', '-w', path, '--name', 'Redgate Dyeing'], io);
    expect(JSON.parse(await readFile(path, 'utf8')).name).toBe('Redgate Dyeing');
  });

  it('will not write over a file that is already there', async () => {
    await writeFile(path, '{}', 'utf8');
    const io = capture();
    expect(await run(['init', '-w', path], io)).toBe(4);
    expect(io.err.text()).toMatch(/is already there, pass --works with another path/);
    expect(await readFile(path, 'utf8')).toBe('{}');
  });

  it('writes json that ends in a newline, like everything else here', async () => {
    await run(['init', '-w', path], capture());
    expect((await readFile(path, 'utf8')).endsWith('\n')).toBe(true);
  });

  it('prints the whole document as json when asked', async () => {
    const io = capture();
    await run(['init', '-w', path, '--format', 'json'], io);
    const written = JSON.parse(io.out.text());
    expect(written.written).toBe(path);
    expect(written.machines).toHaveLength(1);
  });

  it('writes a file a card can be built from without any editing', async () => {
    await run(['init', '-w', path], capture());
    const recipe = join(directory, 'recipe.json');
    await writeFile(
      recipe,
      JSON.stringify({
        id: 'R1',
        name: 'a first shade',
        process: 'exhaust',
        substrate: 'cotton',
        liquorRatio: 8,
        dyes: [{ code: 'RB-19', owf: 1.2 }],
        auxiliaries: [{ code: 'WET', dose: 1 }],
      }),
      'utf8'
    );
    const io = capture();
    expect(await run(['card', '-w', path, '-r', recipe, '-l', '200'], io)).toBe(0);
    expect(io.out.text()).toMatch(/RB-19/);
  });
});

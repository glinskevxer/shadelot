import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { EXIT, notFoundError } from '../../src/cli/exit.js';
import {
  collect,
  createOutput,
  numberFlag,
  positiveFlag,
  readArray,
  readJson,
  readObject,
  pathExists,
  readRows,
  refuseOverwrite,
  readShaped,
} from '../../src/cli/io.js';

let directory;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-cli-'));
});

describe('reading a json file', () => {
  it('gives back what the file holds', async () => {
    const path = join(directory, 'recipe.json');
    await writeFile(path, JSON.stringify({ id: 'R1' }), 'utf8');
    expect(await readJson(path)).toEqual({ id: 'R1' });
  });

  it('says what was being looked for when it is not there', async () => {
    const path = join(directory, 'missing.json');
    await expect(readJson(path, { what: 'recipe' })).rejects.toThrow(/the recipe .* is not there/);
  });

  it('leaves with the not found code', async () => {
    try {
      await readJson(join(directory, 'missing.json'));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.exitCode).toBe(EXIT.notFound);
    }
  });

  it('says which file was malformed rather than throwing a bare syntax error', async () => {
    const path = join(directory, 'broken.json');
    await writeFile(path, '{ nope', 'utf8');
    await expect(readJson(path, { what: 'recipe' })).rejects.toThrow(/is not valid json/);
  });

  it('reports a directory as bad data rather than as a missing file', async () => {
    await expect(readJson(directory)).rejects.toThrow(/is a directory/);
  });
});

describe('the shape guards', () => {
  it('accept an array where an array is wanted', async () => {
    const path = join(directory, 'rolls.json');
    await writeFile(path, JSON.stringify([{ id: 'A' }]), 'utf8');
    expect(await readArray(path)).toHaveLength(1);
    await expect(readObject(path, { what: 'recipe' })).rejects.toThrow(/must hold an object/);
  });

  it('accept an object where an object is wanted', async () => {
    const path = join(directory, 'recipe.json');
    await writeFile(path, JSON.stringify({ id: 'R1' }), 'utf8');
    expect(await readObject(path)).toEqual({ id: 'R1' });
    await expect(readArray(path, { what: 'roll list' })).rejects.toThrow(/must hold an array/);
  });

  it('refuse null where an object is wanted', async () => {
    const path = join(directory, 'null.json');
    await writeFile(path, 'null', 'utf8');
    await expect(readObject(path)).rejects.toThrow(/must hold an object/);
  });
});

describe('flag parsing', () => {
  it('collects a repeated flag into a list', () => {
    expect(collect('b', collect('a'))).toEqual(['a', 'b']);
    expect(collect('a')).toEqual(['a']);
  });

  it('parses a number and names the flag when it cannot', () => {
    expect(numberFlag('--load')('12.5')).toBe(12.5);
    expect(() => numberFlag('--load')('heavy')).toThrow(/--load must be a number, received heavy/);
  });

  it('takes zero and negatives on a plain number flag', () => {
    expect(numberFlag('--drift')('-0.4')).toBe(-0.4);
    expect(numberFlag('--drift')('0')).toBe(0);
  });

  it('refuses them where the flag must be positive', () => {
    expect(positiveFlag('--load')('12')).toBe(12);
    expect(() => positiveFlag('--load')('0')).toThrow(/greater than zero/);
    expect(() => positiveFlag('--load')('-3')).toThrow(/greater than zero/);
  });
});

describe('capturing output', () => {
  it('keeps every line a command wrote', () => {
    const output = createOutput();
    output.write('first');
    output.write('second');
    expect(output.lines).toEqual(['first', 'second']);
    expect(output.text()).toBe('first\nsecond');
  });

  it('turns whatever it is given into a string', () => {
    const output = createOutput();
    output.write(12);
    expect(output.lines).toEqual(['12']);
  });
});

describe('reading a file through its shape', () => {
  it('gives back the document when it is complete', async () => {
    const path = join(directory, 'recipe.json');
    await writeFile(
      path,
      JSON.stringify({
        id: 'R1',
        name: 'olive',
        process: 'exhaust',
        substrate: 'cotton',
        liquorRatio: 8,
        dyes: [],
      }),
      'utf8'
    );
    expect((await readShaped(path, 'recipe')).id).toBe('R1');
  });

  it('reports every problem in one message rather than the first', async () => {
    const path = join(directory, 'thin.json');
    await writeFile(path, JSON.stringify({ id: 'R1' }), 'utf8');
    await expect(readShaped(path, 'recipe')).rejects.toThrow(/has no name.*has no process/s);
  });

  it('names the file and what it was being read as', async () => {
    const path = join(directory, 'thin.json');
    await writeFile(path, JSON.stringify({ id: 'R1' }), 'utf8');
    await expect(readShaped(path, 'recipe', { what: 'recipe file' })).rejects.toThrow(
      /thin\.json is not usable/
    );
  });

  it('leaves with the invalid data code', async () => {
    const path = join(directory, 'thin.json');
    await writeFile(path, JSON.stringify({}), 'utf8');
    try {
      await readShaped(path, 'recipe');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.exitCode).toBe(EXIT.invalidData);
    }
  });

  it('still reports a missing file as not found', async () => {
    await expect(readShaped(join(directory, 'nope.json'), 'recipe')).rejects.toMatchObject({
      exitCode: EXIT.notFound,
    });
  });

  it('refuses a shape nothing reads', async () => {
    const path = join(directory, 'recipe.json');
    await writeFile(path, JSON.stringify({}), 'utf8');
    await expect(readShaped(path, 'invoice')).rejects.toThrow(/must be one of recipe/);
  });
});

describe('reading a list of rows', () => {
  it('builds every row and gives them all back', async () => {
    const path = join(directory, 'rows.json');
    await writeFile(path, JSON.stringify([{ n: 1 }, { n: 2 }]), 'utf8');
    expect(await readRows(path, (row) => row.n * 2)).toEqual([2, 4]);
  });

  it('names the row that failed, counting from nought', async () => {
    const path = join(directory, 'rows.json');
    await writeFile(path, JSON.stringify([{ n: 1 }, { n: 'two' }]), 'utf8');
    await expect(
      readRows(
        path,
        (row) => {
          if (typeof row.n !== 'number') throw new RangeError('n must be a number');
          return row.n;
        },
        { what: 'counting file' }
      )
    ).rejects.toThrow(/row 1 in the counting file is not usable, n must be a number/);
  });

  it('says how many rows it wanted when there are not enough', async () => {
    const path = join(directory, 'rows.json');
    await writeFile(path, '[]', 'utf8');
    await expect(readRows(path, (row) => row, { what: 'lots file' })).rejects.toThrow(
      /holds 0 rows, it needs at least 1/
    );
  });

  it('takes a list that may be empty when the caller says so', async () => {
    const path = join(directory, 'rows.json');
    await writeFile(path, '[]', 'utf8');
    expect(await readRows(path, (row) => row, { min: 0 })).toEqual([]);
  });

  it('passes a command error from the builder straight through', async () => {
    const path = join(directory, 'rows.json');
    await writeFile(path, JSON.stringify([{}]), 'utf8');
    await expect(
      readRows(path, () => {
        throw notFoundError('the thing it needed is not there');
      })
    ).rejects.toMatchObject({ exitCode: EXIT.notFound });
  });

  it('hands the builder the index as well as the row', async () => {
    const path = join(directory, 'rows.json');
    await writeFile(path, JSON.stringify([{}, {}, {}]), 'utf8');
    expect(await readRows(path, (row, index) => index)).toEqual([0, 1, 2]);
  });
});

describe('whether a path is there', () => {
  it('says so for a file that is', async () => {
    const path = join(directory, 'here.json');
    await writeFile(path, '{}', 'utf8');
    expect(await pathExists(path)).toBe(true);
  });

  it('says so for one that is not', async () => {
    expect(await pathExists(join(directory, 'nope.json'))).toBe(false);
  });

  it('says so for a directory', async () => {
    expect(await pathExists(directory)).toBe(true);
  });
});

describe('refusing to write over a file', () => {
  it('lets a fresh path through', async () => {
    await expect(refuseOverwrite(join(directory, 'fresh.json'), false)).resolves.toBeUndefined();
  });

  it('stops one that is already there and names the flag', async () => {
    const path = join(directory, 'there.json');
    await writeFile(path, '{}', 'utf8');
    await expect(refuseOverwrite(path, false)).rejects.toThrow(
      /is already there, pass --overwrite to replace it/
    );
  });

  it('lets it through when the caller said to', async () => {
    const path = join(directory, 'there.json');
    await writeFile(path, '{}', 'utf8');
    await expect(refuseOverwrite(path, true)).resolves.toBeUndefined();
  });

  it('names another flag when the command has one', async () => {
    const path = join(directory, 'there.json');
    await writeFile(path, '{}', 'utf8');
    await expect(refuseOverwrite(path, false, { flag: '--force' })).rejects.toThrow(/pass --force/);
  });

  it('leaves with the invalid data code', async () => {
    const path = join(directory, 'there.json');
    await writeFile(path, '{}', 'utf8');
    await expect(refuseOverwrite(path, false)).rejects.toMatchObject({
      exitCode: EXIT.invalidData,
    });
  });

  it('checks before it writes, never after', async () => {
    const path = join(directory, 'there.json');
    await writeFile(path, 'kept', 'utf8');
    await refuseOverwrite(path, false).catch(() => {});
    expect(await readFile(path, 'utf8')).toBe('kept');
  });
});

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { EXIT } from '../../src/cli/exit.js';
import {
  collect,
  createOutput,
  numberFlag,
  positiveFlag,
  readArray,
  readJson,
  readObject,
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

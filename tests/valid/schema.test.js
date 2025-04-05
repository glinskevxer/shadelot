import { describe, expect, it } from 'vitest';
import {
  SHAPES,
  TYPES,
  checkShape,
  describeType,
  fieldsFor,
  shapeNames,
} from '../../src/valid/schema.js';

const recipe = {
  id: 'R1',
  name: 'olive',
  process: 'exhaust',
  substrate: 'cotton',
  liquorRatio: 8,
  dyes: [],
};

describe('the types', () => {
  it('describe themselves in words a message can use', () => {
    expect(describeType('positive')).toMatch(/greater than zero/);
    expect(describeType('reading')).toMatch(/L, a and b/);
    expect(TYPES).toContain('reading');
  });

  it('refuse a type nothing checks', () => {
    expect(() => describeType('colour')).toThrow(/must be one of string/);
  });
});

describe('checking a shape', () => {
  it('passes a complete document', () => {
    expect(checkShape(recipe, fieldsFor('recipe'), { what: 'recipe file' })).toEqual([]);
  });

  it('names every missing field, not the first', () => {
    const problems = checkShape({ id: 'R1' }, fieldsFor('recipe'), { what: 'recipe file' });
    expect(problems).toHaveLength(5);
    expect(problems[0]).toMatch(/has no name/);
  });

  it('lets an optional field be absent', () => {
    expect(checkShape(recipe, fieldsFor('recipe'))).toEqual([]);
    expect(checkShape({ ...recipe, auxiliaries: [] }, fieldsFor('recipe'))).toEqual([]);
  });

  it('still checks an optional field that is present', () => {
    const problems = checkShape({ ...recipe, auxiliaries: 'none' }, fieldsFor('recipe'));
    expect(problems[0]).toMatch(/auxiliaries in the file must be an array/);
  });

  it('treats null the same as absent', () => {
    expect(checkShape({ ...recipe, auxiliaries: null }, fieldsFor('recipe'))).toEqual([]);
  });

  it('names the type a field should have been', () => {
    const problems = checkShape({ ...recipe, liquorRatio: 0 }, fieldsFor('recipe'), {
      what: 'recipe',
    });
    expect(problems[0]).toBe('liquorRatio in the recipe must be a number greater than zero');
  });

  it('refuses a document that is not an object at all', () => {
    expect(checkShape([], fieldsFor('recipe'), { what: 'recipe' })).toEqual([
      'the recipe must be an object',
    ]);
  });

  it('refuses a field list naming a type nothing checks', () => {
    expect(() => checkShape(recipe, [{ name: 'id', type: 'colour' }])).toThrow(/field.type/);
  });
});

describe('the reading type', () => {
  const fields = fieldsFor('order');
  const order = {
    id: 'O1',
    customer: 'K',
    metres: 100,
    dueAt: '2025-05-16',
    standard: { L: 52, a: -14, b: 22 },
  };

  it('takes a complete reading', () => {
    expect(checkShape(order, fields)).toEqual([]);
  });

  it('refuses one with a channel missing', () => {
    const problems = checkShape({ ...order, standard: { L: 52, a: -14 } }, fields);
    expect(problems[0]).toMatch(/standard in the file must be a reading/);
  });

  it('refuses a channel that is a string', () => {
    expect(checkShape({ ...order, standard: { L: '52', a: -14, b: 22 } }, fields)).toHaveLength(1);
  });
});

describe('the shapes this program reads', () => {
  it('names one per file a command is pointed at', () => {
    expect(shapeNames()).toEqual(['recipe', 'profile', 'roll', 'order', 'dipSeries', 'works']);
  });

  it('gives every field a name and a known type', () => {
    for (const [name, fields] of Object.entries(SHAPES)) {
      for (const field of fields) {
        expect(typeof field.name, name).toBe('string');
        expect(TYPES, `${name}.${field.name}`).toContain(field.type);
      }
    }
  });

  it('refuses a shape nothing reads', () => {
    expect(() => fieldsFor('invoice')).toThrow(/must be one of recipe/);
  });

  it('checks the shipped examples against their own shapes', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (name) =>
      JSON.parse(readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8'));
    expect(checkShape(read('recipe-olive.json'), fieldsFor('recipe'))).toEqual([]);
    expect(checkShape(read('profile-reactive-60.json'), fieldsFor('profile'))).toEqual([]);
    expect(checkShape(read('roll-faults.json'), fieldsFor('roll'))).toEqual([]);
    expect(checkShape(read('order.json'), fieldsFor('order'))).toEqual([]);
    expect(checkShape(read('dip-series.json'), fieldsFor('dipSeries'))).toEqual([]);
    expect(checkShape(read('works.json'), fieldsFor('works'))).toEqual([]);
  });
});

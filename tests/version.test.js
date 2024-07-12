import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { name, packagePath, readName, readVersion, version } from '../src/version.js';

describe('the version', () => {
  it('is whatever the package says and is not written down twice', () => {
    const parsed = JSON.parse(readFileSync(packagePath(), 'utf8'));
    expect(version).toBe(parsed.version);
    expect(name).toBe(parsed.name);
  });

  it('looks like a version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reads from another package file when one is given', () => {
    expect(readVersion({ path: packagePath() })).toBe(version);
    expect(readName({ path: packagePath() })).toBe('shadelot');
  });

  it('complains rather than returning nothing when the version is missing', () => {
    expect(() => readVersion({ path: '/dev/null' })).toThrow();
  });
});

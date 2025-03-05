import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDocument, save } from '../../src/store/json.js';
import {
  backupName,
  listBackups,
  newestBackup,
  parseBackupName,
  pruneBackups,
  readBackup,
  stampFor,
  takeBackup,
} from '../../src/store/backup.js';

let directory;
let path;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shadelot-backup-'));
  path = join(directory, 'works.json');
});

const at = (iso) => () => new Date(iso);

describe('the names', () => {
  it('stamp to the second with nothing that needs escaping', () => {
    expect(stampFor(new Date('2025-04-02T09:15:30.000Z'))).toBe('20250402T091530');
    expect(backupName('/works/data.json', new Date('2025-04-02T09:15:30Z'))).toBe(
      'data.json.20250402T091530.bak'
    );
  });

  it('read back the file they came from', () => {
    const parsed = parseBackupName('works.json.20250402T091530.bak');
    expect(parsed.base).toBe('works.json');
    expect(parsed.stamp).toBe('20250402T091530');
  });

  it('ignore anything that is not one', () => {
    expect(parseBackupName('works.json')).toBeNull();
    expect(parseBackupName('notes.txt')).toBeNull();
  });
});

describe('taking a copy', () => {
  it('does nothing when there is no file yet', async () => {
    expect(await takeBackup(path)).toBeNull();
  });

  it('copies an existing file into a backups folder', async () => {
    await save(path, emptyDocument());
    const copy = await takeBackup(path, { now: at('2025-04-02T09:15:30Z') });
    expect(copy).toMatch(/backups\/works\.json\.20250402T091530\.bak$/);
    expect(await readdir(join(directory, 'backups'))).toHaveLength(1);
  });

  it('takes the folder the caller names', async () => {
    await save(path, emptyDocument());
    const elsewhere = join(directory, 'archive');
    await takeBackup(path, { directory: elsewhere, now: at('2025-04-02T09:15:30Z') });
    expect(await readdir(elsewhere)).toHaveLength(1);
  });

  it('keeps a copy per stamp rather than overwriting', async () => {
    await save(path, emptyDocument());
    await takeBackup(path, { now: at('2025-04-02T09:15:30Z') });
    await takeBackup(path, { now: at('2025-04-02T10:15:30Z') });
    expect(await listBackups(path)).toHaveLength(2);
  });
});

describe('listing them', () => {
  it('gives nothing for a file with none', async () => {
    expect(await listBackups(path)).toEqual([]);
  });

  it('gives the newest first', async () => {
    await save(path, emptyDocument());
    await takeBackup(path, { now: at('2025-04-01T09:00:00Z') });
    await takeBackup(path, { now: at('2025-04-03T09:00:00Z') });
    await takeBackup(path, { now: at('2025-04-02T09:00:00Z') });
    const all = await listBackups(path);
    expect(all.map((entry) => entry.stamp)).toEqual([
      '20250403T090000',
      '20250402T090000',
      '20250401T090000',
    ]);
  });

  it('leaves another file backups alone', async () => {
    await save(path, emptyDocument());
    await takeBackup(path, { now: at('2025-04-01T09:00:00Z') });
    const other = join(directory, 'lab.json');
    await save(other, emptyDocument());
    await takeBackup(other, { now: at('2025-04-01T09:00:00Z') });
    expect(await listBackups(path)).toHaveLength(1);
    expect(await listBackups(other)).toHaveLength(1);
  });

  it('ignores a stray file in the folder', async () => {
    await save(path, emptyDocument());
    await takeBackup(path, { now: at('2025-04-01T09:00:00Z') });
    await writeFile(join(directory, 'backups', 'readme.txt'), 'nothing', 'utf8');
    expect(await listBackups(path)).toHaveLength(1);
  });
});

describe('pruning', () => {
  const takeMany = async (count) => {
    await save(path, emptyDocument());
    for (let i = 1; i <= count; i += 1) {
      await takeBackup(path, { now: at(`2025-04-${String(i).padStart(2, '0')}T09:00:00Z`) });
    }
  };

  it('keeps the newest and throws the rest away', async () => {
    await takeMany(6);
    const result = await pruneBackups(path, { keep: 3 });
    expect(result.kept).toBe(3);
    expect(result.removed).toHaveLength(3);
    const left = await listBackups(path);
    expect(left.map((entry) => entry.stamp)).toEqual([
      '20250406T090000',
      '20250405T090000',
      '20250404T090000',
    ]);
  });

  it('does nothing when there are fewer than the keep count', async () => {
    await takeMany(2);
    expect((await pruneBackups(path, { keep: 14 })).removed).toEqual([]);
  });

  it('refuses a keep count of nothing', async () => {
    await expect(pruneBackups(path, { keep: 0 })).rejects.toThrow(/keep/);
    await expect(pruneBackups(path, { keep: 1.5 })).rejects.toThrow(/whole number/);
  });
});

describe('reading one back', () => {
  it('gives a document a caller can put in place', async () => {
    const document = emptyDocument();
    document.recipes.push({ id: 'R1', name: 'olive' });
    await save(path, document);
    const copy = await takeBackup(path, { now: at('2025-04-02T09:15:30Z') });
    const restored = await readBackup(copy);
    expect(restored.recipes).toEqual([{ id: 'R1', name: 'olive' }]);
  });

  it('does not put it in place itself', async () => {
    await save(path, emptyDocument());
    const copy = await takeBackup(path, { now: at('2025-04-02T09:15:30Z') });
    await readBackup(copy);
    const live = await readBackup(path);
    expect(live.recipes).toEqual([]);
  });

  it('finds the newest without the caller listing them', async () => {
    await save(path, emptyDocument());
    await takeBackup(path, { now: at('2025-04-01T09:00:00Z') });
    await takeBackup(path, { now: at('2025-04-05T09:00:00Z') });
    expect((await newestBackup(path)).stamp).toBe('20250405T090000');
  });

  it('says so when there are none', async () => {
    await expect(newestBackup(path)).rejects.toThrow(/has no backups to read/);
  });
});

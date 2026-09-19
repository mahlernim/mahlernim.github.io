import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LocalRepository, ConflictError } from '../src/storage';
import { createEmptyData } from '../src/domain';

describe('atomic local records', () => {
  it('retains a committed household across connections and rejects stale tab writes', async () => {
    const factory = new IDBFactory();
    const a = new LocalRepository('tabs', factory);
    const b = new LocalRepository('tabs', factory);
    const data = createEmptyData(); data.ready = true;
    const initial = await a.loadState();
    expect(initial.revision).toBe(0);
    const saved = await a.saveData(data, 0);
    expect(saved.revision).toBe(1);
    await expect(b.saveData(data, 0)).rejects.toBeInstanceOf(ConflictError);
    expect((await b.loadState()).revision).toBe(1);
    await a.close(); await b.close();
  });

  it('does not replace good data with an invalid import or invalid preferences', async () => {
    const repo = new LocalRepository('invalid', new IDBFactory());
    const data = createEmptyData(); data.ready = true;
    await repo.saveData(data, 0);
    const broken = structuredClone(data);
    broken.observations = [{ reading: -5, time: Date.now(), meter: 'manual', predicted: null }];
    await expect(repo.saveData(broken, 1)).rejects.toThrow();
    await expect(repo.savePreferences({ reminderDay: 9 })).rejects.toThrow();
    expect((await repo.loadState()).data.observations).toEqual([]);
    expect((await repo.loadState()).revision).toBe(1);
    await repo.close();
  });

  it('merges preference edits onto latest records without replacing another tab data', async () => {
    const factory = new IDBFactory();
    const a = new LocalRepository('preferences', factory);
    const b = new LocalRepository('preferences', factory);
    const data = createEmptyData(); data.ready = true;
    await a.saveData(data, 0);
    await b.savePreferences({ lastExportAt: 1000, exportRevision: 1 });
    const state = await a.savePreferences({ reminderDay: 3 });
    expect(state.revision).toBe(1);
    expect(state.preferences).toMatchObject({ lastExportAt: 1000, exportRevision: 1, reminderDay: 3 });
    await a.close(); await b.close();
  });

  it('restores calendar choices atomically and resets local export metadata', async () => {
    const repo = new LocalRepository('restore', new IDBFactory());
    const data = createEmptyData(); data.ready = true;
    await repo.saveData(data, 0);
    await repo.savePreferences({ lastExportAt: 1000, exportRevision: 1 });
    await expect(repo.saveData(data, 1, { reminderDay: 0, reminderHour: 9 })).rejects.toThrow();
    expect((await repo.loadState()).revision).toBe(1);
    const restored = await repo.saveData(data, 1, { reminderDay: 2, reminderHour: 9 });
    expect(restored.preferences).toMatchObject({ reminderDay: 2, reminderHour: 9, lastExportAt: null, exportRevision: null });
    await repo.close();
  });

  it('allows explicit recovery of corrupt state while preserving its original and refusing valid state', async () => {
    const factory = new IDBFactory();
    const repo = new LocalRepository('corrupt', factory);
    await repo.loadState();
    const opened = factory.open('corrupt', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { opened.onsuccess = () => resolve(opened.result); opened.onerror = () => reject(opened.error); });
    const corrupt = { revision: 7, data: { broken: true } };
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(corrupt, 'household'); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    await expect(repo.loadState()).rejects.toThrow();
    const restored = await repo.recoverData(createEmptyData(), { reminderDay: 5, reminderHour: 8 });
    expect(restored.revision).toBe(8);
    expect(restored.preferences.reminderDay).toBe(5);
    await expect(repo.recoverData(createEmptyData(), { reminderDay: 5, reminderHour: 8 })).rejects.toBeInstanceOf(ConflictError);
    const original = await new Promise((resolve, reject) => { const req = db.transaction('state', 'readonly').objectStore('state').get('recovery-before-restore'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    expect(original).toEqual(corrupt);
    db.close(); await repo.close();
  });
});

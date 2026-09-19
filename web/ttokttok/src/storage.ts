import { createEmptyData, decodeBackup, encodeBackup, type AppData } from './domain';

export interface WebPreferences {
  lastExportAt: number | null;
  exportRevision: number | null;
  backupSnoozedUntil: number;
  reminderDay: number;
  reminderHour: number;
}
export interface StoredState {
  data: AppData;
  revision: number;
  updatedAt: number;
  preferences: WebPreferences;
}
export type CalendarPreferences = Pick<WebPreferences, 'reminderDay' | 'reminderHour'>;
const defaults = (): WebPreferences => ({ lastExportAt: null, exportRevision: null, backupSnoozedUntil: 0, reminderDay: 7, reminderHour: 19 });
const empty = (): StoredState => ({ data: createEmptyData(), revision: 0, updatedAt: 0, preferences: defaults() });
export class ConflictError extends Error {
  constructor() { super('다른 탭에서 기록을 변경했어요. 최신 기록을 확인한 뒤 다시 저장해 주세요.'); this.name = 'ConflictError'; }
}

/** One atomic household record. Read-modify-write transactions serialize across tabs. */
export class LocalRepository {
  private connection?: Promise<IDBDatabase>;
  constructor(private readonly name = 'ttokttok-web-v1', private readonly factory = globalThis.indexedDB,
    private readonly changed: () => void = () => {}) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('이 브라우저에서는 기기에 기록을 저장할 수 없어요. 일반 브라우저에서 다시 열어 주세요.'));
    if (!this.connection) this.connection = new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => { this.connection = undefined; reject(request.error); };
      let blocked = false;
      request.onblocked = () => { blocked = true; this.connection = undefined; reject(new Error('다른 똑똑 탭을 닫은 뒤 다시 열어 주세요.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.connection = undefined; };
        db.onclose = () => { this.connection = undefined; };
        resolve(db);
      };
    });
    return this.connection;
  }

  async close(): Promise<void> { (await this.connection)?.close(); this.connection = undefined; }

  private read(raw: StoredState | undefined): StoredState {
    if (raw === undefined) return empty();
    if (!Number.isInteger(raw.revision) || raw.revision < 0 || !raw.preferences || !Number.isFinite(raw.updatedAt)) {
      throw new Error('저장된 기록을 읽을 수 없어요. 기록을 지우지 않았습니다. 백업 파일로 복원해 주세요.');
    }
    return { ...raw, data: decodeBackup(JSON.stringify({ ...raw.data, schema: 4 })), preferences: this.preferences(raw.preferences) };
  }

  private preferences(patch: Partial<WebPreferences>, previous = defaults()): WebPreferences {
    const p = { ...previous, ...patch };
    if (!Number.isInteger(p.reminderDay) || p.reminderDay < 1 || p.reminderDay > 7 || !Number.isInteger(p.reminderHour) || p.reminderHour < 0 || p.reminderHour > 23 ||
      !Number.isFinite(p.backupSnoozedUntil) || p.backupSnoozedUntil < 0 ||
      (p.lastExportAt !== null && (!Number.isFinite(p.lastExportAt) || p.lastExportAt < 0)) ||
      (p.exportRevision !== null && (!Number.isInteger(p.exportRevision) || p.exportRevision < 0))) throw new Error('저장 설정을 확인해 주세요.');
    return { lastExportAt: p.lastExportAt, exportRevision: p.exportRevision, backupSnoozedUntil: p.backupSnoozedUntil, reminderDay: p.reminderDay, reminderHour: p.reminderHour };
  }

  async loadState(): Promise<StoredState> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readonly');
      const request = tx.objectStore('state').get('household');
      let result: StoredState;
      request.onsuccess = () => { try { result = this.read(request.result); } catch (error) { reject(error); } };
      tx.oncomplete = () => resolve(result!);
      tx.onabort = () => reject(tx.error ?? new Error('기록을 읽지 못했어요.'));
      tx.onerror = () => reject(tx.error);
    });
  }

  private async update(transform: (state: StoredState) => StoredState): Promise<StoredState> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const request = store.get('household');
      let next: StoredState;
      let failure: unknown;
      request.onsuccess = () => {
        try { next = transform(this.read(request.result)); store.put(next, 'household'); }
        catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { this.changed(); resolve(next!); };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('기기에 저장하지 못했어요. 입력값을 확인하고 다시 저장하거나 백업 파일로 보관해 주세요.'));
      tx.onerror = () => { /* onabort is the authoritative failure signal. */ };
    });
  }

  async saveData(data: AppData, expectedRevision: number, calendar?: CalendarPreferences): Promise<StoredState> {
    const validated = decodeBackup(encodeBackup(data));
    return this.update(current => {
      if (current.revision !== expectedRevision) throw new ConflictError();
      return { ...current, data: validated, preferences: calendar ? this.preferences({ ...calendar, lastExportAt: null, exportRevision: null, backupSnoozedUntil: 0 }, current.preferences) : current.preferences, revision: current.revision + 1, updatedAt: Date.now() };
    });
  }

  /** Explicit recovery after a failed read. Preserve the damaged value; never replace a readable household. */
  async recoverData(data: AppData, calendar: CalendarPreferences): Promise<StoredState> {
    const validated = decodeBackup(encodeBackup(data));
    const preferences = this.preferences(calendar);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      const request = store.get('household');
      let next: StoredState;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          let readable = true;
          try { this.read(request.result); } catch { readable = false; }
          if (readable) throw new ConflictError();
          store.put(request.result, 'recovery-before-restore');
          const revision = Number.isSafeInteger(request.result?.revision) && request.result.revision >= 0 ? request.result.revision + 1 : 1;
          next = { data: validated, revision, updatedAt: Date.now(), preferences };
          store.put(next, 'household');
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { this.changed(); resolve(next!); };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('백업을 복원하지 못했어요. 원래 기록을 유지했습니다.'));
      tx.onerror = () => {};
    });
  }

  savePreferences(patch: Partial<WebPreferences>): Promise<StoredState> {
    return this.update(current => ({ ...current, preferences: this.preferences(patch, current.preferences) }));
  }
}

let repo: LocalRepository | undefined;
let channel: BroadcastChannel | undefined;
const listeners = new Set<() => void>();
function notify(): void {
  channel?.postMessage('changed');
  try { localStorage.setItem('ttokttok.changed', String(Date.now())); } catch { /* Only a notification fallback. */ }
}
function repository(): LocalRepository {
  if (!repo) {
    repo = new LocalRepository('ttokttok-web-v1', globalThis.indexedDB, notify);
    if ('BroadcastChannel' in globalThis) {
      channel = new BroadcastChannel('ttokttok-records');
      channel.onmessage = () => listeners.forEach(listener => listener());
    }
    globalThis.addEventListener('storage', event => { if ((event as StorageEvent).key === 'ttokttok.changed') listeners.forEach(listener => listener()); });
  }
  return repo;
}
export const loadState = (): Promise<StoredState> => repository().loadState();
export async function saveData(data: AppData, expectedRevision: number, calendar?: CalendarPreferences): Promise<StoredState> {
  const result = await repository().saveData(data, expectedRevision, calendar);
  try { localStorage.setItem('ttokttok.hasRecords', result.data.ready ? '1' : '0'); } catch { /* Landing hint only. */ }
  return result;
}
export async function recoverData(data: AppData, calendar: CalendarPreferences): Promise<StoredState> {
  const result = await repository().recoverData(data, calendar);
  try { localStorage.setItem('ttokttok.hasRecords', result.data.ready ? '1' : '0'); } catch { /* Landing hint only. */ }
  return result;
}
export const savePreferences = (patch: Partial<WebPreferences>): Promise<StoredState> => repository().savePreferences(patch);
export function watchChanges(callback: () => void): () => void { repository(); listeners.add(callback); return () => listeners.delete(callback); }
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted || !navigator.storage.persist) return null;
    return await navigator.storage.persisted() || await navigator.storage.persist();
  } catch { return null; }
}

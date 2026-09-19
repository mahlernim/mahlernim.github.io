import { decodeBackup, encodeBackup, type AppData } from './domain';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const conflict = (): never => { throw new Error('같은 기록을 다른 탭에서도 수정했어요. 초안을 내보낸 뒤 최신 기록에서 변경 내용을 다시 확인해 주세요.'); };

function choose<T>(base: T, draft: T, current: T): T {
  if (same(draft, base) || same(draft, current)) return current;
  if (same(current, base)) return draft;
  return conflict();
}

function rows<T>(base: T[], draft: T[], current: T[], key: (row: T) => string): T[] {
  if (same(draft, base) || same(draft, current)) return current;
  if (same(current, base)) return draft;
  const index = (items: T[]) => {
    const map = new Map(items.map(item => [key(item), item]));
    if (map.size !== items.length) conflict();
    return map;
  };
  const b = index(base), d = index(draft), c = index(current);
  const result: T[] = [];
  for (const id of new Set([...b.keys(), ...c.keys(), ...d.keys()])) {
    const item = choose(b.get(id), d.get(id), c.get(id));
    if (item !== undefined) result.push(item);
  }
  return result;
}

/** Reapply only a user's changes. Conflicting edits stop, and imports never use this function. */
export function mergeChanges(base: AppData, draft: AppData, current: AppData): AppData {
  const merged = structuredClone(current);
  for (const field of ['profile', 'submissionSettings'] as const) {
    const target = merged[field] as unknown as Record<string, unknown>;
    for (const key of Object.keys(base[field])) {
      const b = base[field] as unknown as Record<string, unknown>;
      const d = draft[field] as unknown as Record<string, unknown>;
      const c = current[field] as unknown as Record<string, unknown>;
      target[key] = choose(b[key], d[key], c[key]);
    }
  }
  merged.ready = choose(base.ready, draft.ready, current.ready);
  merged.observations = rows(base.observations, draft.observations, current.observations, row => `${row.meter}\u0000${row.time}`);
  merged.periods = rows(base.periods, draft.periods, current.periods, row => `${row.meter}\u0000${row.start}\u0000${row.end}`);
  merged.gasappBills = rows(base.gasappBills, draft.gasappBills, current.gasappBills, row => row.month);
  merged.samchullyBills = rows(base.samchullyBills, draft.samchullyBills, current.samchullyBills, row => row.month);
  merged.energyTalkBills = rows(base.energyTalkBills, draft.energyTalkBills, current.energyTalkBills, row => row.month);
  merged.directBills = rows(base.directBills, draft.directBills, current.directBills, row => `${row.month}\u0000${row.meterId}`);
  merged.submissions = rows(base.submissions, draft.submissions, current.submissions, row => `${row.cycle}\u0000${row.attemptedAt}`);
  return decodeBackup(encodeBackup(merged));
}

import { expect, it } from 'vitest';
import { createEmptyData, dayStart } from '../src/domain';
import { mergeChanges } from '../src/merge';

it('reapplies independent changes without reviving deleted readings or losing another tab profile change', () => {
  const base = createEmptyData();
  base.observations = [{ time: dayStart('2025-01-01'), reading: 10, meter: 'manual', predicted: null }];
  const draft = structuredClone(base);
  draft.observations.push({ time: dayStart('2025-01-03'), reading: 30, meter: 'manual', predicted: null });
  const current = structuredClone(base);
  current.observations = [{ time: dayStart('2025-01-02'), reading: 20, meter: 'manual', predicted: null }];
  current.profile.providerId = 'seoul';
  const result = mergeChanges(base, draft, current);
  expect(result.observations.map(row => row.reading)).toEqual([20, 30]);
  expect(result.profile.providerId).toBe('seoul');
});

it('rejects concurrent corrections to the same reading without modifying either snapshot', () => {
  const base = createEmptyData();
  base.observations = [{ time: dayStart('2025-01-01'), reading: 10, meter: 'manual', predicted: null }];
  const draft = structuredClone(base); draft.observations[0].reading = 11;
  const current = structuredClone(base); current.observations[0].reading = 12;
  expect(() => mergeChanges(base, draft, current)).toThrow('같은 기록');
  expect(current.observations[0].reading).toBe(12);
  expect(draft.observations[0].reading).toBe(11);
});

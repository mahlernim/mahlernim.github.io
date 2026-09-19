import { describe, expect, it } from 'vitest';
import { addObservation, createEmptyData, dateOf, dayStart, decodeBackup, encodeBackup, estimate, validatePeriods, type AppData } from '../src/domain';

const now = dayStart('2026-09-19') + 12 * 3_600_000;

function backup(schema: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema, ready: true,
    profile: { providerId: 'busan', meter: 'manual', contract: 'contract', plannedDate: null, syncTime: null, reminder: true, reminderDay: 7, reminderHour: 19 },
    periods: [], observations: [], submissionSettings: { enabled: true, automatic: true, recentDays: 7 }, submissions: [], ...extra,
  });
}

describe('portable backup schema', () => {
  it('reads Android public schemas 1 through 4 and never restores automatic actions', () => {
    for (const schema of [1, 2, 3, 4]) {
      const decoded = decodeBackup(backup(schema), now);
      expect(decoded.ready).toBe(true);
      expect(decoded.profile.reminder).toBe(false);
      expect(decoded.profile.reconnectRequired).toBe(false);
      expect(decoded.submissionSettings.enabled).toBe(true);
      expect(decoded.submissionSettings.automatic).toBe(false);
    }
  });

  it('round-trips every public schema-4 collection while removing authentication-shaped keys', () => {
    const input: AppData = {
      ...createEmptyData(), ready: true,
      profile: { ...createEmptyData().profile, providerId: 'samchully', meter: 'meter-a', contract: 'contract-a', customerNumber: 'customer' },
      periods: [{ start: '2025-09-01', end: '2025-09-30', usage: 20, meter: 'meter-a', previous: 10, current: 30, billMonth: '202509', amount: 1000, unitCost: 1, baseCost: 2 }],
      observations: [{ time: dayStart('2026-09-10'), reading: 100, meter: 'meter-a', predicted: 99 }],
      submissions: [{ cycle: 'cycle', periodStart: '2026-09-01', periodEnd: '2026-09-30', value: 100, attemptedAt: now, status: 'confirmed', detail: 'done', confirmationSource: 'readback' }],
      gasappBills: [{ month: '2025-09', usage: 20, amount: 1000, start: '2025-09-01', end: '2025-09-30' }],
      samchullyBills: [{ month: '202509', start: '2025-09-01', end: '2025-09-30', previous: 10, current: 30, usage: 20, amount: 1000, meter: '0123456789abcdef' }],
      energyTalkBills: [{ month: '202509', usage: '20 m³', amount: '1000원', unit: 'm³' }],
      directBills: [{ month: '2025-09', usage: 20, amount: 1000, start: '2025-09-01', end: '2025-09-30', previous: 10, current: 30, meterId: 'meter-a' }],
    };
    const text = encodeBackup(input);
    expect(text).not.toMatch(/credentials|token|password|cachedSelfRead|gasappConnection|energyTalkConnection/i);
    const restored = decodeBackup(text, now);
    expect(restored.gasappBills).toEqual(input.gasappBills);
    expect(restored.samchullyBills).toEqual(input.samchullyBills);
    expect(restored.energyTalkBills).toEqual(input.energyTalkBills);
    expect(restored.directBills).toEqual(input.directBills);
    expect(restored.submissionSettings.enabled).toBe(false);
  });

  it('preserves manual safety settings but disables automatic submission and reminders', () => {
    const decoded = decodeBackup(backup(4, { submissionSettings: { enabled: true, automatic: true, requireRecentCheck: false, recentDays: 40, reminder: true, reminderHour: 6, reminderMinute: 15 } }), now);
    expect(decoded.submissionSettings).toEqual({ enabled: true, automatic: false, requireRecentCheck: false, recentDays: 40, reminder: false, reminderHour: 6, reminderMinute: 15 });
    const exported = JSON.parse(encodeBackup(decoded));
    expect(exported.submissionSettings).toEqual(decoded.submissionSettings);
    expect(exported.profile).not.toHaveProperty('reconnectRequired');
  });

  it('rejects malformed imports and impossible period or meter history', () => {
    expect(() => decodeBackup('{')).toThrow();
    expect(() => decodeBackup(backup(4, { periods: [{ start: '2026-09-10', end: '2026-09-09', usage: 1, meter: 'manual' }] }), now)).toThrow();
    expect(() => decodeBackup(backup(4, { observations: [{ time: now, reading: 20, meter: 'manual' }, { time: now, reading: 19, meter: 'manual' }] }), now)).toThrow();
    expect(() => decodeBackup(backup(5), now)).toThrow();
    expect(() => decodeBackup(backup(4, { profile: { providerId: 'busan', meter: 'x'.repeat(101) } }), now)).toThrow();
    expect(() => decodeBackup(backup(4, { observations: [{ time: now, reading: 1, meter: 'x'.repeat(101), predicted: null }] }), now)).toThrow();
    expect(() => decodeBackup(backup(4, { energyTalkBills: [{ month: '202509', usage: 'x'.repeat(201), amount: '1000원', unit: 'm³' }] }), now)).toThrow();
    expect(() => decodeBackup(backup(4, { directBills: [{ month: '2025-09', usage: 1, amount: 1, start: null, end: null, previous: null, current: null, meterId: 'x'.repeat(101) }] }), now)).toThrow();
    expect(() => decodeBackup(backup(4, { submissions: [{ periodStart: '2026-09-01', periodEnd: '2026-09-30', value: 1, attemptedAt: now, status: 'pending', detail: '' }] }), now)).toThrow();
  });
});

describe('Korea calendar and estimator', () => {
  it('uses Korea dates across UTC midnight', () => {
    expect(dateOf(Date.UTC(2026, 8, 18, 16))).toBe('2026-09-19');
    expect(dayStart('2026-09-19')).toBe(Date.UTC(2026, 8, 18, 15));
  });

  it('matches the Android recent-reading estimate and calibration correction behavior', () => {
    let data = createEmptyData();
    data = { ...data, profile: { ...data.profile, meter: 'meter-a' } };
    data = addObservation(data, 100, dayStart('2026-09-01'));
    data = addObservation(data, 120, dayStart('2026-09-11'));
    const result = estimate(data, dayStart('2026-09-16'));
    expect(result.reading).toBeCloseTo(130, 8);
    expect(result.daily).toBeCloseTo(2, 8);
    expect(result.source).toBe('최근 실측 기준 · 계절 정보 없음');
  });

  it('matches the Android seasonal partial-day golden', () => {
    const periods = [7, 8, 9, 10, 11].map(month => {
      const days = new Date(Date.UTC(2025, month, 0)).getUTCDate();
      return { start: `2025-${String(month).padStart(2, '0')}-01`, end: `2025-${String(month).padStart(2, '0')}-${days}`, usage: 2 * days, meter: 'manual', previous: null, current: null, billMonth: '', amount: null, unitCost: null, baseCost: null };
    });
    const time = dayStart('2026-09-17');
    const data = { ...createEmptyData(), periods, observations: [{ time: time - 7 * 86_400_000, reading: 100, meter: 'manual', predicted: null }] };
    const result = estimate(data, time + 43_200_000);
    expect(result.reading).toBeCloseTo(115, 5);
    expect(result.daily).toBeCloseTo(2, 5);
  });

  it('uses Android median pairwise slopes after a single misread', () => {
    const time = dayStart('2026-09-17');
    const data = { ...createEmptyData(), observations: [
      { time: time - 21 * 86_400_000, reading: 100, meter: 'manual', predicted: null },
      { time: time - 14 * 86_400_000, reading: 114, meter: 'manual', predicted: null },
      { time: time - 7 * 86_400_000, reading: 170, meter: 'manual', predicted: null },
      { time, reading: 142, meter: 'manual', predicted: null },
    ] };
    const result = estimate(data, time + 86_400_000);
    expect(result.daily).toBeCloseTo(2, 5);
    expect(result.reading).toBeCloseTo(144, 5);
  });

  it('uses Android LocalDate.minusYears behavior for leap-day seasonal history', () => {
    const data = { ...createEmptyData(), periods: [
      { start: '2023-02-01', end: '2023-02-28', usage: 56, meter: 'manual', previous: null, current: null, billMonth: '', amount: null, unitCost: null, baseCost: null },
      { start: '2023-03-01', end: '2023-03-31', usage: 93, meter: 'manual', previous: null, current: null, billMonth: '', amount: null, unitCost: null, baseCost: null },
    ], observations: [{ time: dayStart('2024-02-22'), reading: 100, meter: 'manual', predicted: null }] };
    const result = estimate(data, dayStart('2024-02-29'));
    expect(result.daily).not.toBeNull();
    expect(result.reading).toBeGreaterThan(100);
  });

  it('does not carry a different meter forecast into a new meter observation', () => {
    const data = { ...createEmptyData(), profile: { ...createEmptyData().profile, meter: 'new' }, observations: [{ time: dayStart('2026-09-01'), reading: 100, meter: 'old', predicted: 123 }] };
    const next = addObservation(data, 10, dayStart('2026-09-02'));
    expect(next.observations.at(-1)).toMatchObject({ meter: 'new', predicted: null });
  });

  it('preserves an earlier prediction when a reading is corrected within ten minutes', () => {
    let data = createEmptyData();
    data = { ...data, profile: { ...data.profile, meter: 'meter-a' } };
    data = addObservation(data, 100, dayStart('2026-09-01'));
    data = addObservation(data, 120, dayStart('2026-09-11'));
    data = { ...data, observations: data.observations.map((observation, index) => index === 1 ? { ...observation, predicted: 117 } : observation) };
    const before = data.observations.at(-1)?.predicted;
    data = addObservation(data, 121, dayStart('2026-09-11') + 5 * 60_000);
    expect(data.observations).toHaveLength(2);
    expect(data.observations.at(-1)?.predicted).toBe(before);
  });

  it('rejects overlapping periods using the supplied current time', () => {
    expect(() => validatePeriods([
      { start: '2025-01-01', end: '2025-01-31', usage: 10, meter: 'manual', previous: null, current: null, billMonth: '', amount: null, unitCost: null, baseCost: null },
      { start: '2025-01-31', end: '2025-02-28', usage: 10, meter: 'manual', previous: null, current: null, billMonth: '', amount: null, unitCost: null, baseCost: null },
    ], now)).toThrow();
  });
});

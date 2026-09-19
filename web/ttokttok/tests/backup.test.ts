import { describe, expect, it } from 'vitest';
import { decodePortableBackup, encodePortableBackup } from '../src/backup';
import { createEmptyData, dayStart } from '../src/domain';

describe('portable backup', () => {
  it('round-trips calendar choices through Android profile fields only', () => {
    const data = createEmptyData();
    data.ready = true;
    data.profile.customerNumber = 'historical-customer';
    const exported = JSON.parse(encodePortableBackup(data, { reminderDay: 3, reminderHour: 8 }));
    expect(Object.keys(exported.profile).sort()).toEqual([
      'contract', 'customerNumber', 'meter', 'plannedDate', 'providerId', 'reminder', 'reminderDay',
      'reminderHour', 'reminderRepeatCount', 'syncTime',
    ]);
    expect(exported.profile).toMatchObject({ reminder: false, reminderDay: 3, reminderHour: 8, customerNumber: 'historical-customer' });
    const restored = decodePortableBackup(JSON.stringify(exported), dayStart('2026-09-19'));
    expect(restored.preferences).toEqual({ reminderDay: 3, reminderHour: 8 });
    expect(restored.data.profile.customerNumber).toBe('historical-customer');
  });

  it('never restores authentication or cached provider state from an Android-shaped backup', () => {
    const raw = JSON.stringify({
      schema: 4, ready: true,
      profile: { providerId: 'busan', meter: 'manual', contract: '', plannedDate: null, syncTime: null, reminder: true, reminderDay: 7, reminderHour: 19, reminderRepeatCount: 3, customerNumber: '', reconnectRequired: true },
      periods: [], observations: [], submissions: [],
      submissionSettings: { enabled: true, automatic: true, requireRecentCheck: true, recentDays: 7, reminder: true, reminderHour: 9, reminderMinute: 0 },
      credentials: { username: 'user', password: 'secret' },
      cachedSelfRead: { cycle: 'secret' }, gasappConnection: { token: 'secret' }, cachedGasappTarget: { meter: 'secret' },
      energyTalkConnection: { tenant: 'kne', session: 'secret' },
    });
    const restored = decodePortableBackup(raw, dayStart('2026-09-19')).data;
    expect(restored.profile.reconnectRequired).toBe(false);
    expect(restored.submissionSettings).toMatchObject({ enabled: true, automatic: false, reminder: false });
    expect(JSON.stringify(restored)).not.toMatch(/secret|credentials|cachedSelfRead|gasappConnection|energyTalkConnection/);
  });
});

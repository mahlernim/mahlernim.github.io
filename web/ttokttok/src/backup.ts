import { decodeBackup, encodeBackup, type AppData } from './domain';
import type { CalendarPreferences } from './storage';

/** Calendar choices use existing public Android profile fields, with notifications disabled. */
export function encodePortableBackup(data: AppData, preferences: CalendarPreferences): string {
  return encodeBackup({ ...data, profile: { ...data.profile, reminderDay: preferences.reminderDay, reminderHour: preferences.reminderHour } });
}

export function decodePortableBackup(raw: string, now = Date.now()): { data: AppData; preferences: CalendarPreferences } {
  const data = decodeBackup(raw, now);
  return { data, preferences: { reminderDay: data.profile.reminderDay, reminderHour: data.profile.reminderHour } };
}

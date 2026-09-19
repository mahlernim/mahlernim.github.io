import { describe, expect, it } from 'vitest';
import { calendarUrl, calendarSubscriptionUrl } from '../src/calendar';
describe('generic reminders', () => {
  it('uses only weekday and hour, never household data', () => {
    expect(calendarUrl(7, 19)).toBe('/ttokttok/app/calendar/sun-1900.ics');
    expect(calendarSubscriptionUrl(1, 0)).toBe('webcal://ahn-lab.org/ttokttok/app/calendar/mon-0000.ics');
    expect(() => calendarUrl(8, 12)).toThrow();
    expect(() => calendarUrl(7, 24)).toThrow();
  });
});

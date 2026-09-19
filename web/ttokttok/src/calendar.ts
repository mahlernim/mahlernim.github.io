const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export function calendarUrl(day: number, hour: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 7 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('알림 요일과 시간을 확인해 주세요.');
  }
  return `/ttokttok/app/calendar/${days[day - 1]}-${String(hour).padStart(2, '0')}00.ics`;
}
export function calendarSubscriptionUrl(day: number, hour: number): string {
  return `webcal://ahn-lab.org${calendarUrl(day, hour)}`;
}

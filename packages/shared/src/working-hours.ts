// Open or closed status from the schedule (C-37). Pure functions, used by the
// backend and tested on their own. Times are in the wholesaler's time zone.

export interface OpenDay {
  dayOfWeek: number; // 0 Sunday ... 6 Saturday
  opensAt: string; // "09:00"
  closesAt: string; // "18:00"
}

export interface LocalMoment {
  date: string; // "2026-11-19"
  dayOfWeek: number;
  time: string; // "14:30"
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; nextOpening: { date: string; time: string } | null };

function addDays(date: string, n: number): { date: string; dayOfWeek: number } {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return { date: d.toISOString().slice(0, 10), dayOfWeek: d.getUTCDay() };
}

export function openStatus(
  now: LocalMoment,
  days: OpenDay[],
  closedDates: Set<string>,
): OpenStatus {
  const today = days.find((d) => d.dayOfWeek === now.dayOfWeek);
  if (
    today &&
    !closedDates.has(now.date) &&
    now.time >= today.opensAt &&
    now.time < today.closesAt
  ) {
    return { open: true, closesAt: today.closesAt };
  }
  // Later today, or one of the next 14 days
  for (let i = 0; i <= 14; i++) {
    const { date, dayOfWeek } = i === 0 ? now : addDays(now.date, i);
    if (closedDates.has(date)) continue;
    const day = days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day) continue;
    if (i === 0 && now.time >= day.opensAt) continue;
    return { open: false, nextOpening: { date, time: day.opensAt } };
  }
  return { open: false, nextOpening: null };
}

// The local date, day of week, and time in a time zone, for example Africa/Cairo
export function localMoment(at: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { date, dayOfWeek: weekdays.indexOf(get('weekday')), time: `${get('hour')}:${get('minute')}` };
}

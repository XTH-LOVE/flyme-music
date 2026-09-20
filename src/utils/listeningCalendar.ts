/**
 * Listening calendar: a contribution-graph over the play log.
 *
 * The version this replaces poured a flat run of days into a seven-row grid, so
 * the rows had no relationship to weekdays at all - it looked like a calendar
 * without being one. Everything here is pure, so the week alignment, the
 * intensity quantisation and the streaks can be tested without a DOM.
 */

export type WeekStart = 0 | 1;

export interface CalendarDay {
  /** Local YYYY-MM-DD. */
  key: string;
  /** Local midnight of this day. */
  ts: number;
  count: number;
  /** 0-4; 0 means "no plays". */
  level: number;
  /** Weekday row, 0 = the first day of the week. */
  row: number;
  /** Week column, 0-based. */
  col: number;
  /** Days after today, which only exist to square off the last column. */
  future: boolean;
}

export interface CalendarMonth {
  col: number;
  label: string;
}

export interface ListeningCalendar {
  days: CalendarDay[];
  months: CalendarMonth[];
  weeks: number;
  weekStart: WeekStart;
  total: number;
  activeDays: number;
  maxCount: number;
  /** Consecutive active days ending today; 0 when today has no plays yet. */
  currentStreak: number;
  /** Longest run of consecutive active days in the window. */
  longestStreak: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local YYYY-MM-DD. Built from local fields on purpose - `toISOString` is UTC. */
export function dayKeyOf(ts: number): string {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** Local midnight of the day `ts` falls in. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Calendar arithmetic through `setDate`, never through milliseconds: adding
 * 86 400 000 ms lands on the wrong hour across a DST boundary.
 */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight of the first day of the week containing `ts`. */
export function startOfWeek(ts: number, weekStart: WeekStart = 0): number {
  const day = startOfDay(ts);
  const weekday = new Date(day).getDay();
  return addDays(day, -((weekday - weekStart + 7) % 7));
}

/**
 * Quantises play counts to `steps` shades.
 *
 * Cut-offs come from the active days themselves rather than from the maximum,
 * because a single marathon day would otherwise flatten the rest of the window
 * to its lightest shade. Identical counts all get the same shade, which is the
 * point - a calendar where every day looks different when the data says
 * otherwise is lying.
 */
export function intensityLevels(counts: readonly number[], steps = 4): number[] {
  const active = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (!active.length) return counts.map(() => 0);
  if (active[0] === active[active.length - 1]) {
    return counts.map((c) => (c > 0 ? 1 : 0));
  }
  return counts.map((count) => {
    if (count <= 0) return 0;
    let level = 1;
    for (let i = 1; i < steps; i += 1) {
      if (count >= active[Math.floor((active.length * i) / steps)]) level = i + 1;
    }
    return Math.min(steps, level);
  });
}

export interface CalendarOptions {
  /** Inclusive end day. Defaults to today. */
  end?: number;
  /** Week columns; 53 covers a full year. */
  weeks?: number;
  /** 0 = Sunday (the contribution-graph convention), 1 = Monday. */
  weekStart?: WeekStart;
}

export function buildListeningCalendar(
  entries: readonly { ts: number }[],
  options: CalendarOptions = {},
): ListeningCalendar {
  const weekStart = options.weekStart ?? 0;
  const weeks = Math.max(1, Math.round(options.weeks ?? 53));
  const today = startOfDay(options.end ?? Date.now());
  const gridStart = addDays(startOfWeek(today, weekStart), -(weeks - 1) * 7);

  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = dayKeyOf(entry.ts);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const slots: { ts: number; count: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const ts = addDays(gridStart, i);
    slots.push({ ts, count: counts.get(dayKeyOf(ts)) ?? 0, future: ts > today });
  }

  const levels = intensityLevels(slots.map((slot) => slot.count));
  const days: CalendarDay[] = slots.map((slot, i) => ({
    key: dayKeyOf(slot.ts),
    ts: slot.ts,
    count: slot.count,
    level: levels[i],
    row: i % 7,
    col: Math.floor(i / 7),
    future: slot.future,
  }));

  // A column is labelled with the month of its own first day, and only when
  // that differs from the column before it - which is what stops the label
  // repeating across every column a month spans.
  const months: CalendarMonth[] = [];
  let lastMonth = -1;
  for (let col = 0; col < weeks; col += 1) {
    const first = days[col * 7];
    if (first.future) break;
    const month = new Date(first.ts).getMonth();
    if (month !== lastMonth) {
      months.push({ col, label: month + 1 + '月' });
      lastMonth = month;
    }
  }

  const elapsed = days.filter((day) => !day.future);
  let longestStreak = 0;
  let run = 0;
  for (const day of elapsed) {
    run = day.count > 0 ? run + 1 : 0;
    if (run > longestStreak) longestStreak = run;
  }

  // Counts back from today rather than from the last active day, so a gap today
  // reads as "no streak" instead of silently continuing yesterday's.
  let currentStreak = 0;
  for (let i = elapsed.length - 1; i >= 0; i -= 1) {
    if (elapsed[i].count === 0) break;
    currentStreak += 1;
  }

  return {
    days,
    months,
    weeks,
    weekStart,
    total: elapsed.reduce((sum, day) => sum + day.count, 0),
    activeDays: elapsed.filter((day) => day.count > 0).length,
    maxCount: elapsed.reduce((max, day) => Math.max(max, day.count), 0),
    currentStreak,
    longestStreak,
  };
}

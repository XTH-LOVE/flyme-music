import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildListeningCalendar,
  dayKeyOf,
  intensityLevels,
  startOfDay,
  startOfWeek,
} from './listeningCalendar';

/** A fixed Wednesday, so weekday-dependent assertions are unambiguous. */
const WEDNESDAY = new Date(2026, 8, 16, 15, 30, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

const at = (ts: number, hour = 12) => {
  const d = new Date(ts);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

describe('dayKeyOf', () => {
  it('uses local fields, not UTC', () => {
    // 00:30 local on the 1st is the previous day in UTC for eastern zones, and
    // a UTC-derived key would file it under the wrong date.
    expect(dayKeyOf(new Date(2026, 0, 1, 0, 30).getTime())).toBe('2026-01-01');
  });

  it('zero-pads month and day', () => {
    expect(dayKeyOf(new Date(2026, 2, 7, 9, 0).getTime())).toBe('2026-03-07');
  });
});

describe('startOfDay / addDays', () => {
  it('strips the time of day', () => {
    expect(startOfDay(WEDNESDAY)).toBe(new Date(2026, 8, 16, 0, 0, 0, 0).getTime());
  });

  it('walks across a month boundary', () => {
    expect(dayKeyOf(addDays(new Date(2026, 0, 31).getTime(), 1))).toBe('2026-02-01');
  });

  it('walks backwards across a year boundary', () => {
    expect(dayKeyOf(addDays(new Date(2026, 0, 1).getTime(), -1))).toBe('2025-12-31');
  });

  it('always lands on local midnight', () => {
    const result = addDays(WEDNESDAY, 3);
    const d = new Date(result);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('startOfWeek', () => {
  it('lands on Sunday by default', () => {
    const start = startOfWeek(WEDNESDAY);
    expect(new Date(start).getDay()).toBe(0);
    expect(dayKeyOf(start)).toBe('2026-09-13');
  });

  it('lands on Monday when asked', () => {
    const start = startOfWeek(WEDNESDAY, 1);
    expect(new Date(start).getDay()).toBe(1);
    expect(dayKeyOf(start)).toBe('2026-09-14');
  });

  it('is a no-op on the first day of the week', () => {
    const sunday = new Date(2026, 8, 13).getTime();
    expect(startOfWeek(sunday)).toBe(startOfDay(sunday));
    expect(startOfWeek(new Date(2026, 8, 14).getTime(), 1)).toBe(
      startOfDay(new Date(2026, 8, 14).getTime()),
    );
  });
});

describe('intensityLevels', () => {
  it('gives everything level 0 when nothing was played', () => {
    expect(intensityLevels([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('gives a single active day the lightest shade, not the heaviest', () => {
    expect(intensityLevels([0, 7, 0])).toEqual([0, 1, 0]);
  });

  it('keeps identical counts on the same shade', () => {
    // The regression this guards: spreading by rank would paint equal days in
    // four different shades.
    expect(intensityLevels([3, 3, 3, 3, 3])).toEqual([1, 1, 1, 1, 1]);
  });

  it('spreads a real distribution across all four shades', () => {
    expect(intensityLevels([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('is monotonic: a busier day is never a lighter shade', () => {
    const counts = [0, 1, 1, 2, 5, 9, 9, 40, 0, 3];
    const levels = intensityLevels(counts);
    for (let i = 0; i < counts.length; i += 1) {
      for (let j = 0; j < counts.length; j += 1) {
        if (counts[i] < counts[j]) expect(levels[i]).toBeLessThanOrEqual(levels[j]);
      }
    }
  });

  it('does not let one marathon day flatten the rest', () => {
    // Thresholds from the maximum would put every ordinary day at level 1.
    const levels = intensityLevels([0, 1, 2, 3, 4, 5, 500]);
    expect(levels[6]).toBe(4);
    expect(Math.max(...levels.slice(0, 6))).toBeGreaterThan(1);
  });
});

describe('buildListeningCalendar', () => {
  const build = (entries: { ts: number }[], weeks = 3) =>
    buildListeningCalendar(entries, { end: WEDNESDAY, weeks });

  it('lays out whole weeks, so each row is the same weekday', () => {
    const cal = build([]);
    expect(cal.days).toHaveLength(21);
    for (const day of cal.days) {
      expect(new Date(day.ts).getDay()).toBe(day.row);
    }
  });

  it('ends the grid on the week containing the end date', () => {
    const cal = build([]);
    const last = cal.days[cal.days.length - 1];
    expect(new Date(last.ts).getDay()).toBe(6);
    expect(last.future).toBe(true);
  });

  it('marks days after the end date as future rather than as zero-play days', () => {
    const cal = build([]);
    // Sunday 13th through Wednesday 16th are real; Thursday onwards are not.
    expect(cal.days.filter((d) => d.future).map((d) => dayKeyOf(d.ts))).toEqual([
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
  });

  it('counts only plays inside the window', () => {
    const cal = build([
      { ts: at(WEDNESDAY, 9) },
      { ts: at(WEDNESDAY, 10) },
      { ts: at(addDays(WEDNESDAY, -1)) },
      { ts: at(addDays(WEDNESDAY, -40)) },
    ]);
    expect(cal.total).toBe(3);
    expect(cal.activeDays).toBe(2);
    expect(cal.maxCount).toBe(2);
  });

  it('puts several plays on the same day into one cell', () => {
    const cal = build([{ ts: at(WEDNESDAY, 1) }, { ts: at(WEDNESDAY, 23) }]);
    const cell = cal.days.find((d) => d.key === dayKeyOf(WEDNESDAY));
    expect(cell?.count).toBe(2);
  });

  it('labels a month once, on the column where it starts', () => {
    const cal = buildListeningCalendar([], { end: WEDNESDAY, weeks: 53 });
    const labels = cal.months.map((m) => m.label);
    // 53 weeks spans 13 month boundaries, so the same month name can legitimately
    // appear twice a year apart - what must never happen is a repeat next to
    // itself, which would mean the label was emitted per column rather than per
    // month.
    for (let i = 1; i < labels.length; i += 1) {
      expect(labels[i]).not.toBe(labels[i - 1]);
    }
    expect(labels.length).toBeGreaterThanOrEqual(11);
    // Every label sits on a column that actually begins in that month.
    for (const month of cal.months) {
      const first = cal.days[month.col * 7];
      expect(new Date(first.ts).getMonth() + 1 + '月').toBe(month.label);
    }
  });

  it('measures the streak ending today', () => {
    const cal = build([
      { ts: at(WEDNESDAY) },
      { ts: at(addDays(WEDNESDAY, -1)) },
      { ts: at(addDays(WEDNESDAY, -2)) },
      { ts: at(addDays(WEDNESDAY, -5)) },
    ]);
    expect(cal.currentStreak).toBe(3);
  });

  it('reports no current streak when today is empty, even after a long run', () => {
    const cal = build([
      { ts: at(addDays(WEDNESDAY, -1)) },
      { ts: at(addDays(WEDNESDAY, -2)) },
      { ts: at(addDays(WEDNESDAY, -3)) },
    ]);
    expect(cal.currentStreak).toBe(0);
    expect(cal.longestStreak).toBe(3);
  });

  it('finds the longest run even when it is not the current one', () => {
    const cal = build(
      [
        { ts: at(addDays(WEDNESDAY, -12)) },
        { ts: at(addDays(WEDNESDAY, -11)) },
        { ts: at(addDays(WEDNESDAY, -10)) },
        { ts: at(addDays(WEDNESDAY, -9)) },
        { ts: at(WEDNESDAY) },
      ],
      4,
    );
    expect(cal.longestStreak).toBe(4);
    expect(cal.currentStreak).toBe(1);
  });

  it('honours a Monday-first week', () => {
    const cal = buildListeningCalendar([], { end: WEDNESDAY, weeks: 3, weekStart: 1 });
    for (const day of cal.days) {
      expect(day.row).toBe((new Date(day.ts).getDay() + 6) % 7);
    }
  });

  it('tolerates a single-column window', () => {
    const cal = build([], 1);
    expect(cal.days).toHaveLength(7);
    expect(cal.months).toHaveLength(1);
  });

  it('never reports a play count for a future day', () => {
    const cal = build([{ ts: WEDNESDAY + 5 * DAY }]);
    expect(cal.days.filter((d) => d.future).every((d) => d.count === 0)).toBe(true);
    expect(cal.total).toBe(0);
  });
});

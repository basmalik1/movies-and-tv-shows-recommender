import type { UpcomingEntry } from "./upcoming";

/**
 * Month-grid maths for the calendar page.
 *
 * All arithmetic is in UTC and all dates are `yyyy-mm-dd` strings, matching how
 * TMDB reports air dates. Using local time here would shift an episode into the
 * wrong cell for anyone west of Greenwich.
 */

export interface CalendarDay {
  /** ISO `yyyy-mm-dd`. */
  date: string;
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  entries: UpcomingEntry[];
}

export interface MonthGrid {
  year: number;
  /** 0-based, matching `Date.getUTCMonth()`. */
  monthIndex: number;
  weeks: CalendarDay[][];
  /** Entries falling inside this month, in date order. */
  entriesInMonth: UpcomingEntry[];
}

/** 0 = Sunday. Weeks start on Monday by default. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addMonths(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const total = year * 12 + monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
}

export function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function monthLabel(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Weekday headers in the same order the grid renders them. */
export function weekdayLabels(weekStartsOn: Weekday = 1): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    // 1970-01-04 was a Sunday, so this maps cleanly onto weekday numbers.
    const day = new Date(Date.UTC(1970, 0, 4 + ((weekStartsOn + index) % 7)));
    return day.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  });
}

/**
 * Lay a month out as whole weeks, padded with the surrounding days so every row
 * has seven cells. Returns five or six rows depending on how the month falls.
 */
export function buildMonthGrid({
  year,
  monthIndex,
  entries,
  today = new Date(),
  weekStartsOn = 1,
}: {
  year: number;
  monthIndex: number;
  entries: UpcomingEntry[];
  today?: Date;
  weekStartsOn?: Weekday;
}): MonthGrid {
  const byDate = new Map<string, UpcomingEntry[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  const todayIso = isoDay(today);
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const leadingDays = (firstWeekday - weekStartsOn + 7) % 7;
  const length = daysInMonth(year, monthIndex);
  const cellCount = Math.ceil((leadingDays + length) / 7) * 7;

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let cell = 0; cell < cellCount; cell += 1) {
    const date = new Date(Date.UTC(year, monthIndex, cell - leadingDays + 1));
    const iso = isoDay(date);
    const weekday = date.getUTCDay();

    week.push({
      date: iso,
      dayOfMonth: date.getUTCDate(),
      inMonth: date.getUTCMonth() === monthIndex && date.getUTCFullYear() === year,
      isToday: iso === todayIso,
      isWeekend: weekday === 0 || weekday === 6,
      entries: byDate.get(iso) ?? [],
    });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(length).padStart(2, "0")}`;

  return {
    year,
    monthIndex,
    weeks,
    entriesInMonth: entries
      .filter((entry) => entry.date >= monthStart && entry.date <= monthEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
  };
}

/** The window a calendar month needs fetched, including its padding days. */
export function monthRange(
  year: number,
  monthIndex: number,
  weekStartsOn: Weekday = 1,
): { from: string; to: string } {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const leadingDays = (firstWeekday - weekStartsOn + 7) % 7;
  const length = daysInMonth(year, monthIndex);
  const cellCount = Math.ceil((leadingDays + length) / 7) * 7;

  return {
    from: isoDay(new Date(Date.UTC(year, monthIndex, 1 - leadingDays))),
    to: isoDay(new Date(Date.UTC(year, monthIndex, cellCount - leadingDays))),
  };
}

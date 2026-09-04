import { describe, expect, it } from "vitest";

import { addMonths, buildMonthGrid, daysInMonth, monthRange } from "./calendar";
import type { UpcomingEntry } from "./upcoming";

function makeEntry(date: string, title = "Show"): UpcomingEntry {
  return {
    id: `${title}-${date}`,
    tmdbId: 1,
    mediaType: "tv",
    title,
    posterPath: null,
    kind: "episode",
    date,
    headline: "S01E01",
    detail: null,
    daysAway: 0,
  };
}

describe("daysInMonth", () => {
  it("handles month lengths including leap years", () => {
    expect(daysInMonth(2026, 0)).toBe(31); // January
    expect(daysInMonth(2026, 1)).toBe(28); // February, common year
    expect(daysInMonth(2024, 1)).toBe(29); // February, leap year
    expect(daysInMonth(2026, 3)).toBe(30); // April
  });
});

describe("addMonths", () => {
  it("rolls forward across a year boundary", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 });
  });

  it("rolls backward across a year boundary", () => {
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 });
  });

  it("handles jumps of more than a year", () => {
    expect(addMonths(2026, 5, 14)).toEqual({ year: 2027, monthIndex: 7 });
    expect(addMonths(2026, 5, -18)).toEqual({ year: 2024, monthIndex: 11 });
  });
});

describe("buildMonthGrid", () => {
  const today = new Date("2026-09-15T00:00:00Z");

  it("produces whole weeks of seven days", () => {
    const grid = buildMonthGrid({ year: 2026, monthIndex: 8, entries: [], today });
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks.length).toBeGreaterThanOrEqual(5);
  });

  it("starts each week on Monday by default", () => {
    const grid = buildMonthGrid({ year: 2026, monthIndex: 8, entries: [], today });
    for (const week of grid.weeks) {
      expect(new Date(`${week[0].date}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it("honours a Sunday week start", () => {
    const grid = buildMonthGrid({
      year: 2026,
      monthIndex: 8,
      entries: [],
      today,
      weekStartsOn: 0,
    });
    for (const week of grid.weeks) {
      expect(new Date(`${week[0].date}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });

  it("marks padding days from neighbouring months as out of month", () => {
    // September 2026 starts on a Tuesday, so Monday 31 August leads the grid.
    const grid = buildMonthGrid({ year: 2026, monthIndex: 8, entries: [], today });
    const first = grid.weeks[0][0];

    expect(first.date).toBe("2026-08-31");
    expect(first.inMonth).toBe(false);

    const days = grid.weeks.flat().filter((day) => day.inMonth);
    expect(days).toHaveLength(30);
    expect(days[0].date).toBe("2026-09-01");
    expect(days.at(-1)?.date).toBe("2026-09-30");
  });

  it("places an entry in the cell for its air date", () => {
    const grid = buildMonthGrid({
      year: 2026,
      monthIndex: 8,
      entries: [makeEntry("2026-09-18", "Severance")],
      today,
    });

    const day = grid.weeks.flat().find((cell) => cell.date === "2026-09-18");
    expect(day?.entries.map((entry) => entry.title)).toEqual(["Severance"]);
    expect(grid.weeks.flat().filter((cell) => cell.entries.length > 0)).toHaveLength(1);
  });

  it("stacks several entries that share a day", () => {
    const grid = buildMonthGrid({
      year: 2026,
      monthIndex: 8,
      entries: [makeEntry("2026-09-18", "A"), makeEntry("2026-09-18", "B")],
      today,
    });

    const day = grid.weeks.flat().find((cell) => cell.date === "2026-09-18");
    expect(day?.entries).toHaveLength(2);
  });

  it("flags today and weekends", () => {
    const grid = buildMonthGrid({ year: 2026, monthIndex: 8, entries: [], today });
    const cells = grid.weeks.flat();

    expect(cells.filter((cell) => cell.isToday)).toHaveLength(1);
    expect(cells.find((cell) => cell.isToday)?.date).toBe("2026-09-15");
    expect(cells.find((cell) => cell.date === "2026-09-19")?.isWeekend).toBe(true);
    expect(cells.find((cell) => cell.date === "2026-09-18")?.isWeekend).toBe(false);
  });

  it("excludes entries outside the month from entriesInMonth but still renders them in padding cells", () => {
    const grid = buildMonthGrid({
      year: 2026,
      monthIndex: 8,
      entries: [makeEntry("2026-08-31", "Before"), makeEntry("2026-09-10", "Inside")],
      today,
    });

    expect(grid.entriesInMonth.map((entry) => entry.title)).toEqual(["Inside"]);
    const padding = grid.weeks.flat().find((cell) => cell.date === "2026-08-31");
    expect(padding?.entries).toHaveLength(1);
  });

  it("adds a sixth row when the month cannot fit in five", () => {
    // August 2026 starts on a Saturday: 5 leading days + 31 = 36 cells, so six rows.
    const grid = buildMonthGrid({ year: 2026, monthIndex: 7, entries: [], today });
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks.flat().filter((day) => day.inMonth)).toHaveLength(31);

    // February 2027 starts on a Monday with 28 days: exactly four rows, no padding.
    const february = buildMonthGrid({ year: 2027, monthIndex: 1, entries: [], today });
    expect(february.weeks).toHaveLength(4);
    expect(february.weeks.flat().every((day) => day.inMonth)).toBe(true);
  });
});

describe("monthRange", () => {
  it("covers every cell the grid will render, padding included", () => {
    const range = monthRange(2026, 8);
    const grid = buildMonthGrid({
      year: 2026,
      monthIndex: 8,
      entries: [],
      today: new Date("2026-09-15T00:00:00Z"),
    });
    const cells = grid.weeks.flat();

    expect(range.from).toBe(cells[0].date);
    expect(range.to).toBe(cells.at(-1)?.date);
  });
});

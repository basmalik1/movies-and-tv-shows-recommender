import { describe, expect, it } from "vitest";

import { makeShow, makeTitle } from "./test-utils";
import {
  buildSchedule,
  expandableSeasons,
  formatRelativeDay,
  movieEntriesInRange,
} from "./upcoming";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("buildSchedule", () => {
  it("lists an upcoming episode and labels an episode 1 as a season premiere", () => {
    const midSeason = makeShow({
      tmdbId: 1,
      title: "Mid Season",
      nextAiredEpisode: { season: 2, episode: 5, name: "Fallout", airDate: "2026-01-08" },
    });
    const premiere = makeShow({
      tmdbId: 2,
      title: "Premiere",
      nextAiredEpisode: { season: 3, episode: 1, name: "Return", airDate: "2026-01-15" },
    });

    const schedule = buildSchedule([midSeason, premiere], { now: NOW });
    const entries = schedule.days.flatMap((day) => day.entries);

    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("episode");
    expect(entries[0].headline).toBe("S02E05");
    expect(entries[1].kind).toBe("season-premiere");
    expect(entries[1].headline).toBe("Season 3 premiere");
  });

  it("orders by date and groups same-day entries together", () => {
    const schedule = buildSchedule(
      [
        makeShow({
          tmdbId: 1,
          nextAiredEpisode: { season: 1, episode: 2, name: "B", airDate: "2026-02-01" },
        }),
        makeShow({
          tmdbId: 2,
          nextAiredEpisode: { season: 1, episode: 2, name: "A", airDate: "2026-02-01" },
        }),
        makeShow({
          tmdbId: 3,
          nextAiredEpisode: { season: 1, episode: 2, name: "C", airDate: "2026-01-10" },
        }),
      ],
      { now: NOW },
    );

    expect(schedule.days.map((day) => day.date)).toEqual(["2026-01-10", "2026-02-01"]);
    expect(schedule.days[1].entries).toHaveLength(2);
  });

  it("falls back to an announced season when TMDB has no next episode", () => {
    const show = makeShow({ tmdbId: 4, seasonCount: 1, nextAiredEpisode: null });
    show.seasons.push({
      seasonNumber: 2,
      name: "Season 2",
      episodeCount: 8,
      airDate: "2026-03-01",
    });

    const entries = buildSchedule([show], { now: NOW }).days.flatMap((day) => day.entries);

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("season-premiere");
    expect(entries[0].detail).toBe("8 episodes");
  });

  it("separates renewed shows that have no announced date", () => {
    const schedule = buildSchedule(
      [makeShow({ tmdbId: 5, nextAiredEpisode: null, inProduction: true })],
      { now: NOW },
    );

    expect(schedule.total).toBe(0);
    expect(schedule.unscheduled).toHaveLength(1);
  });

  it("includes unwatched films with a future release date", () => {
    const upcoming = makeTitle({ tmdbId: 6, status: "watchlist", date: "2026-06-01" });
    const alreadySeen = makeTitle({ tmdbId: 7, status: "completed", date: "2026-06-01" });
    const past = makeTitle({ tmdbId: 8, status: "watchlist", date: "2019-01-01" });

    const entries = buildSchedule([upcoming, alreadySeen, past], { now: NOW }).days.flatMap(
      (day) => day.entries,
    );

    expect(entries.map((entry) => entry.tmdbId)).toEqual([6]);
    expect(entries[0].kind).toBe("movie-release");
  });

  it("ignores dropped titles and anything past the horizon", () => {
    const dropped = makeShow({
      tmdbId: 9,
      status: "dropped",
      nextAiredEpisode: { season: 1, episode: 2, name: "X", airDate: "2026-01-05" },
    });
    const distant = makeShow({
      tmdbId: 10,
      nextAiredEpisode: { season: 1, episode: 2, name: "Y", airDate: "2027-06-01" },
    });

    expect(buildSchedule([dropped, distant], { now: NOW }).total).toBe(0);
  });
});

describe("formatRelativeDay", () => {
  it("uses friendly wording for near dates", () => {
    expect(formatRelativeDay("2026-01-01", NOW)).toBe("Today");
    expect(formatRelativeDay("2026-01-02", NOW)).toBe("Tomorrow");
    expect(formatRelativeDay("2026-01-04", NOW)).toBe("In 3 days");
    expect(formatRelativeDay("2026-01-09", NOW)).toBe("Next week");
  });
});

describe("expandableSeasons", () => {
  const range = { from: "2026-09-01", to: "2026-10-04" };

  it("includes the season currently airing", () => {
    const show = makeShow({
      nextAiredEpisode: { season: 3, episode: 4, name: "X", airDate: "2026-09-12" },
      lastAiredEpisode: { season: 3, episode: 3 },
    });

    expect(expandableSeasons(show, range)).toEqual([3]);
  });

  it("includes a season premiering inside the window", () => {
    const show = makeShow({ seasonCount: 1, nextAiredEpisode: null, lastAiredEpisode: null });
    show.seasons.push({
      seasonNumber: 2,
      name: "Season 2",
      episodeCount: 8,
      airDate: "2026-09-20",
    });

    expect(expandableSeasons(show, range)).toContain(2);
  });

  it("ignores seasons premiering outside the window", () => {
    const show = makeShow({ seasonCount: 1, nextAiredEpisode: null, lastAiredEpisode: null });
    show.seasons.push({
      seasonNumber: 2,
      name: "Season 2",
      episodeCount: 8,
      airDate: "2027-05-01",
    });

    expect(expandableSeasons(show, range)).toEqual([]);
  });

  it("never asks for specials", () => {
    const show = makeShow({ lastAiredEpisode: { season: 0, episode: 1 }, nextAiredEpisode: null });
    expect(expandableSeasons(show, range)).toEqual([]);
  });

  it("returns nothing for films", () => {
    expect(expandableSeasons(makeTitle(), range)).toEqual([]);
  });
});

describe("movieEntriesInRange", () => {
  const range = { from: "2026-09-01", to: "2026-10-04", now: new Date("2026-09-01T00:00:00Z") };

  it("includes an unwatched film releasing in the window", () => {
    const entries = movieEntriesInRange([makeTitle({ status: "watchlist", date: "2026-09-18" })], range);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("movie-release");
  });

  it("skips films already seen, dropped, or outside the window", () => {
    const titles = [
      makeTitle({ tmdbId: 1, status: "completed", date: "2026-09-18" }),
      makeTitle({ tmdbId: 2, status: "dropped", date: "2026-09-18" }),
      makeTitle({ tmdbId: 3, status: "watchlist", date: "2026-12-01" }),
    ];
    expect(movieEntriesInRange(titles, range)).toEqual([]);
  });
});

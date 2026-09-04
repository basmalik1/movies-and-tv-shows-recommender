import { describe, expect, it } from "vitest";

import { makeShow, makeTitle } from "@/lib/test-utils";

import { airedEpisodeKeys, nextEpisodeToWatch, progressFor } from "./progress";
import { episodeKey } from "./types";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("airedEpisodeKeys", () => {
  it("stops at the last episode that has actually aired", () => {
    const show = makeShow({
      seasonCount: 3,
      episodesPerSeason: 10,
      lastAiredEpisode: { season: 2, episode: 4 },
    });

    const aired = airedEpisodeKeys(show, NOW);

    expect(aired).toHaveLength(14);
    expect(aired.at(-1)).toBe("2x4");
    expect(aired).not.toContain("3x1");
  });

  it("excludes specials unless the user has watched one", () => {
    const base = makeShow({ seasonCount: 1, episodesPerSeason: 3 });
    const withSpecials = {
      ...base,
      seasons: [
        { seasonNumber: 0, name: "Specials", episodeCount: 2, airDate: "2019-01-01" },
        ...base.seasons,
      ],
      lastAiredEpisode: { season: 1, episode: 3 },
    };

    expect(airedEpisodeKeys(withSpecials, NOW)).toHaveLength(3);
    expect(
      airedEpisodeKeys({ ...withSpecials, watchedEpisodes: ["0x1"] }, NOW).length,
    ).toBeGreaterThan(3);
  });

  it("falls back to season air dates when the show has no airing metadata", () => {
    const show = makeShow({ seasonCount: 2, episodesPerSeason: 5, lastAiredEpisode: null });
    show.seasons[1].airDate = "2030-01-01";

    expect(airedEpisodeKeys(show, NOW)).toHaveLength(5);
  });
});

describe("progressFor", () => {
  it("measures against aired episodes, not the announced total", () => {
    const show = makeShow({
      seasonCount: 3,
      episodesPerSeason: 10,
      lastAiredEpisode: { season: 1, episode: 10 },
      watchedEpisodes: Array.from({ length: 10 }, (_, i) => episodeKey(1, i + 1)),
    });

    const progress = progressFor(show, NOW);

    expect(progress.watched).toBe(10);
    expect(progress.aired).toBe(10);
    expect(progress.total).toBe(30);
    expect(progress.percent).toBe(100);
    expect(progress.caughtUp).toBe(true);
  });

  it("ignores ticks against episodes that have not aired", () => {
    const show = makeShow({
      seasonCount: 2,
      episodesPerSeason: 5,
      lastAiredEpisode: { season: 1, episode: 5 },
      watchedEpisodes: ["1x1", "2x1"],
    });

    expect(progressFor(show, NOW).watched).toBe(1);
  });

  it("treats a film as a single unit", () => {
    expect(progressFor(makeTitle({ status: "completed" }), NOW).percent).toBe(100);
    expect(progressFor(makeTitle({ status: "watchlist" }), NOW).percent).toBe(0);
  });
});

describe("nextEpisodeToWatch", () => {
  it("returns the first aired episode that is not ticked", () => {
    const show = makeShow({
      seasonCount: 2,
      episodesPerSeason: 3,
      lastAiredEpisode: { season: 2, episode: 3 },
      watchedEpisodes: ["1x1", "1x2", "1x3", "2x1"],
    });

    expect(nextEpisodeToWatch(show, NOW)).toEqual({ season: 2, episode: 2, key: "2x2" });
  });

  it("fills gaps before moving on", () => {
    const show = makeShow({
      seasonCount: 1,
      episodesPerSeason: 5,
      lastAiredEpisode: { season: 1, episode: 5 },
      watchedEpisodes: ["1x1", "1x3", "1x4"],
    });

    expect(nextEpisodeToWatch(show, NOW)?.key).toBe("1x2");
  });

  it("returns null once everything aired has been watched", () => {
    const show = makeShow({
      seasonCount: 1,
      episodesPerSeason: 2,
      lastAiredEpisode: { season: 1, episode: 2 },
      watchedEpisodes: ["1x1", "1x2"],
    });

    expect(nextEpisodeToWatch(show, NOW)).toBeNull();
  });

  it("returns null for films", () => {
    expect(nextEpisodeToWatch(makeTitle(), NOW)).toBeNull();
  });
});

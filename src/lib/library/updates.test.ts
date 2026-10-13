import { describe, expect, it } from "vitest";

import { makeShow, makeTitle } from "@/lib/test-utils";

import { diffTitle, followedTitles, summarizeReport } from "./updates";

describe("followedTitles", () => {
  it("includes series you are part-way through", () => {
    const watching = makeShow({ tmdbId: 1, status: "watching" });
    expect(followedTitles([watching]).map((t) => t.tmdbId)).toEqual([1]);
  });

  it("includes finished series that may still return", () => {
    const returning = makeShow({
      tmdbId: 1,
      status: "completed",
      showStatus: "Returning Series",
    });
    const inProduction = makeShow({ tmdbId: 2, status: "completed", inProduction: true });
    const ended = makeShow({ tmdbId: 3, status: "completed", showStatus: "Ended" });

    expect(followedTitles([returning, inProduction, ended]).map((t) => t.tmdbId)).toEqual([1, 2]);
  });

  it("includes unseen films but not ones already watched", () => {
    const unseen = makeTitle({ tmdbId: 1, status: "watchlist" });
    const seen = makeTitle({ tmdbId: 2, status: "completed" });

    expect(followedTitles([unseen, seen]).map((t) => t.tmdbId)).toEqual([1]);
  });

  it("never includes anything dropped", () => {
    const dropped = makeShow({ status: "dropped", inProduction: true });
    expect(followedTitles([dropped])).toEqual([]);
  });
});

describe("diffTitle", () => {
  it("reports a newly announced season", () => {
    const before = makeShow({ seasonCount: 2 });
    const after = makeShow({ seasonCount: 2 });
    after.seasons.push({
      seasonNumber: 3,
      name: "Season 3",
      episodeCount: 10,
      airDate: "2027-03-05",
    });

    const [update] = diffTitle(before, after);
    expect(update.kind).toBe("new-season");
    expect(update.summary).toContain("Season 3");
    expect(update.summary).toContain("2027");
  });

  it("reports a season that gained a date it did not have", () => {
    const before = makeShow({ seasonCount: 2 });
    before.seasons[1].airDate = null;
    const after = makeShow({ seasonCount: 2 });
    after.seasons[1].airDate = "2027-01-10";

    const kinds = diffTitle(before, after).map((update) => update.kind);
    expect(kinds).toContain("season-dated");
  });

  it("reports a next episode appearing where there was none", () => {
    const before = makeShow({ nextAiredEpisode: null });
    const after = makeShow({
      nextAiredEpisode: { season: 2, episode: 5, name: "Return", airDate: "2026-11-02" },
    });

    const [update] = diffTitle(before, after);
    expect(update.kind).toBe("episode-scheduled");
    expect(update.summary).toContain("S02E05");
  });

  it("reports the same episode moving to a different date", () => {
    const before = makeShow({
      nextAiredEpisode: { season: 2, episode: 5, name: "X", airDate: "2026-11-02" },
    });
    const after = makeShow({
      nextAiredEpisode: { season: 2, episode: 5, name: "X", airDate: "2026-11-09" },
    });

    const [update] = diffTitle(before, after);
    expect(update.kind).toBe("date-moved");
  });

  it("stays quiet when a show simply advances to its next episode", () => {
    // Episode 5 aired, so episode 6 is now next. That is not news.
    const before = makeShow({
      nextAiredEpisode: { season: 2, episode: 5, name: "X", airDate: "2026-11-02" },
    });
    const after = makeShow({
      nextAiredEpisode: { season: 2, episode: 6, name: "Y", airDate: "2026-11-09" },
    });

    expect(diffTitle(before, after)).toEqual([]);
  });

  it("reports a show ending", () => {
    const before = makeShow({ showStatus: "Returning Series" });
    const after = makeShow({ showStatus: "Ended" });

    expect(diffTitle(before, after).map((u) => u.kind)).toEqual(["ended"]);
  });

  it("reports a film's release moving", () => {
    const before = makeTitle({ date: "2026-12-25" });
    const after = makeTitle({ date: "2027-02-14" });

    const [update] = diffTitle(before, after);
    expect(update.kind).toBe("release-moved");
    expect(update.summary).toContain("2027");
  });

  it("finds nothing when nothing changed", () => {
    const show = makeShow({
      nextAiredEpisode: { season: 2, episode: 5, name: "X", airDate: "2026-11-02" },
    });
    expect(diffTitle(show, { ...show })).toEqual([]);
  });

  it("ignores specials being added", () => {
    const before = makeShow({ seasonCount: 1 });
    const after = makeShow({ seasonCount: 1 });
    after.seasons.unshift({
      seasonNumber: 0,
      name: "Specials",
      episodeCount: 3,
      airDate: "2026-12-01",
    });

    expect(diffTitle(before, after)).toEqual([]);
  });
});

describe("summarizeReport", () => {
  it("says plainly when nothing is new", () => {
    expect(summarizeReport({ checked: 7, failed: 0, updates: [] })).toBe(
      "Checked 7 titles. Nothing new announced.",
    );
  });

  it("counts updates and the shows they span", () => {
    const update = {
      id: "tv:1",
      tmdbId: 1,
      mediaType: "tv" as const,
      title: "Show",
      kind: "new-season" as const,
      summary: "Season 3 announced",
    };
    const text = summarizeReport({
      checked: 4,
      failed: 0,
      updates: [update, { ...update, kind: "episode-scheduled" as const }],
    });

    expect(text).toContain("2 updates");
    expect(text).toContain("1 show");
  });

  it("mentions failures without hiding the result", () => {
    const text = summarizeReport({ checked: 5, failed: 2, updates: [] });
    expect(text).toContain("2 could not be reached");
  });

  it("handles having nothing to check", () => {
    expect(summarizeReport({ checked: 0, failed: 0, updates: [] })).toContain("Nothing to check");
  });
});

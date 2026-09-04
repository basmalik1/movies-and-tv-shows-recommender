import { describe, expect, it } from "vitest";

import { DAY, makeTitle } from "@/lib/test-utils";

import { buildTasteProfile, signalOf } from "./profile";

describe("signalOf", () => {
  const now = Date.UTC(2026, 0, 1);

  it("treats a high rating as a strong positive and a low one as negative", () => {
    const loved = makeTitle({ rating: 10, status: "completed", updatedAt: now });
    const hated = makeTitle({ rating: 2, status: "completed", updatedAt: now });

    expect(signalOf(loved, now)).toBeGreaterThan(0.9);
    expect(signalOf(hated, now)).toBeLessThan(-0.9);
  });

  it("puts the neutral point at 6.5 rather than at the middle of the scale", () => {
    const neutral = makeTitle({ rating: 6.5, status: "completed", updatedAt: now });
    expect(signalOf(neutral, now)).toBeCloseTo(0, 5);
  });

  it("counts a watchlist entry far more weakly than something finished", () => {
    const finished = makeTitle({ status: "completed", updatedAt: now });
    const queued = makeTitle({ status: "watchlist", updatedAt: now });

    expect(signalOf(finished, now)).toBeGreaterThan(signalOf(queued, now) * 3);
  });

  it("treats an unrated dropped title as a rejection", () => {
    const dropped = makeTitle({ status: "dropped", rating: null, updatedAt: now });
    expect(signalOf(dropped, now)).toBeLessThan(0);
  });

  it("decays with age but never all the way to zero", () => {
    const fresh = makeTitle({ rating: 9, updatedAt: now });
    const old = makeTitle({ rating: 9, updatedAt: now - 2000 * DAY });

    const oldSignal = signalOf(old, now);
    expect(oldSignal).toBeLessThan(signalOf(fresh, now));
    expect(oldSignal).toBeGreaterThan(0.4);
  });
});

describe("buildTasteProfile", () => {
  const now = Date.UTC(2026, 0, 1);

  it("ranks a keyword shared by two loved titles above one seen only once", () => {
    const profile = buildTasteProfile(
      [
        makeTitle({ tmdbId: 1, rating: 9, keywordIds: [100, 200], updatedAt: now }),
        makeTitle({ tmdbId: 2, rating: 9, keywordIds: [100, 300], updatedAt: now }),
      ],
      now,
    );

    expect(profile.keywords[100]).toBeGreaterThan(profile.keywords[200]);
    expect(profile.keywords[100]).toBeGreaterThan(profile.keywords[300]);
  });

  it("gives a disliked title's exclusive features a negative weight", () => {
    const profile = buildTasteProfile(
      [
        makeTitle({ tmdbId: 1, rating: 9, genreIds: [18] }),
        makeTitle({ tmdbId: 2, rating: 2, genreIds: [27] }),
      ],
      now,
    );

    expect(profile.genres[18]).toBeGreaterThan(0);
    expect(profile.genres[27]).toBeLessThan(0);
  });

  it("does not let a title with many tags drown out a title with few", () => {
    const sparse = buildTasteProfile(
      [makeTitle({ tmdbId: 1, rating: 9, keywordIds: [1, 2] })],
      now,
    );
    const dense = buildTasteProfile(
      [makeTitle({ tmdbId: 1, rating: 9, keywordIds: Array.from({ length: 40 }, (_, i) => i) })],
      now,
    );

    // Both profiles are unit vectors, so neither can dominate on raw magnitude.
    const magnitude = (vector: Record<number, number>) =>
      Math.sqrt(Object.values(vector).reduce((sum, value) => sum + value * value, 0));

    expect(magnitude(sparse.keywords)).toBeCloseTo(1, 5);
    expect(magnitude(dense.keywords)).toBeCloseTo(1, 5);
  });

  it("splits the library into anchors and detractors and excludes everything tracked", () => {
    const profile = buildTasteProfile(
      [
        makeTitle({ tmdbId: 1, mediaType: "movie", rating: 9 }),
        makeTitle({ tmdbId: 2, mediaType: "tv", rating: 3 }),
      ],
      now,
    );

    expect(profile.anchors.map((a) => a.tmdbId)).toEqual([1]);
    expect(profile.detractors.map((a) => a.tmdbId)).toEqual([2]);
    expect(profile.excludeIds).toEqual(["movie:1", "tv:2"]);
  });

  it("centres the era on liked titles only", () => {
    const profile = buildTasteProfile(
      [
        makeTitle({ tmdbId: 1, rating: 9, year: 2000 }),
        makeTitle({ tmdbId: 2, rating: 9, year: 2010 }),
        makeTitle({ tmdbId: 3, rating: 1, year: 1960 }),
      ],
      now,
    );

    expect(profile.eraCenter).toBeGreaterThan(1999);
    expect(profile.eraCenter).toBeLessThan(2011);
  });

  it("returns empty vectors for an empty library rather than throwing", () => {
    const profile = buildTasteProfile([], now);
    expect(profile.keywords).toEqual({});
    expect(profile.anchors).toEqual([]);
    expect(profile.eraCenter).toBeNull();
  });
});

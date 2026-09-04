import { describe, expect, it } from "vitest";

import { rankTmdbCandidates, toRecommendationItem, type TmdbCandidate } from "./tmdb-ranking";

function makeCandidate(overrides: Partial<TmdbCandidate> = {}): TmdbCandidate {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "Candidate",
    overview: "",
    posterPath: null,
    backdropPath: null,
    date: "2020-01-01",
    year: 2020,
    voteAverage: 7.4,
    voteCount: 1000,
    popularity: 20,
    genreIds: [18],
    originalLanguage: "en",
    key: `movie:${overrides.tmdbId ?? 1}`,
    anchorCount: 1,
    bestPosition: 0,
    via: [{ title: "Severance", rating: 9 }],
    ...overrides,
  };
}

describe("rankTmdbCandidates", () => {
  it("puts titles linked to several of your entries first", () => {
    const ranked = rankTmdbCandidates([
      makeCandidate({ tmdbId: 1, anchorCount: 1, bestPosition: 0 }),
      makeCandidate({ tmdbId: 2, anchorCount: 3, bestPosition: 12 }),
    ]);

    expect(ranked.map((entry) => entry.tmdbId)).toEqual([2, 1]);
  });

  it("falls back to TMDB's own placement when agreement is equal", () => {
    const ranked = rankTmdbCandidates([
      makeCandidate({ tmdbId: 1, bestPosition: 7 }),
      makeCandidate({ tmdbId: 2, bestPosition: 2 }),
    ]);

    expect(ranked.map((entry) => entry.tmdbId)).toEqual([2, 1]);
  });

  it("breaks remaining ties on popularity", () => {
    const ranked = rankTmdbCandidates([
      makeCandidate({ tmdbId: 1, popularity: 5 }),
      makeCandidate({ tmdbId: 2, popularity: 90 }),
    ]);

    expect(ranked.map((entry) => entry.tmdbId)).toEqual([2, 1]);
  });

  it("does not mutate the input", () => {
    const input = [makeCandidate({ tmdbId: 1 }), makeCandidate({ tmdbId: 2, anchorCount: 5 })];
    rankTmdbCandidates(input);
    expect(input.map((entry) => entry.tmdbId)).toEqual([1, 2]);
  });
});

describe("toRecommendationItem", () => {
  it("reports the TMDB rating rather than inventing a taste match", () => {
    const item = toRecommendationItem(makeCandidate({ voteAverage: 8.3 }));
    expect(item.score).toBe(83);
  });

  it("credits the library title TMDB linked it to", () => {
    const item = toRecommendationItem(makeCandidate());
    expect(item.reasons[0].text).toContain("Severance");
    expect(item.reasons[0].text).toContain("9/10");
  });

  it("says how many of your titles agreed when more than one did", () => {
    const item = toRecommendationItem(
      makeCandidate({
        anchorCount: 3,
        via: [
          { title: "Severance", rating: 9 },
          { title: "Devs", rating: 8 },
        ],
      }),
    );

    expect(item.reasons[0].text).toContain("3 titles");
  });

  it("never claims a taste match in its reasons", () => {
    const text = toRecommendationItem(makeCandidate())
      .reasons.map((reason) => reason.text)
      .join(" ")
      .toLowerCase();

    expect(text).not.toContain("themes you gravitate");
    expect(text).not.toContain("wheelhouse");
  });
});

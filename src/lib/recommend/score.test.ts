import { describe, expect, it } from "vitest";

import { makeTitle } from "@/lib/test-utils";
import type { NormalizedTitle } from "@/lib/tmdb/types";

import type { Candidate } from "./candidates";
import { buildTasteProfile } from "./profile";
import { diversify, prescore, scoreCandidate, type CandidateFeatures } from "./score";
import { buildIdf } from "./vector";

const GENRE_NAMES = { 18: "Drama", 27: "Horror", 878: "Science Fiction" };

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const base: NormalizedTitle = {
    tmdbId: 900,
    mediaType: "movie",
    title: "Candidate",
    overview: "",
    posterPath: null,
    backdropPath: null,
    date: "2021-01-01",
    year: 2021,
    voteAverage: 7.5,
    voteCount: 5000,
    popularity: 40,
    genreIds: [18],
    originalLanguage: "en",
  };

  return {
    ...base,
    key: `${overrides.mediaType ?? base.mediaType}:${overrides.tmdbId ?? base.tmdbId}`,
    sources: [{ kind: "recommendation", weight: 1 }],
    ...overrides,
  };
}

function makeFeatures(overrides: Partial<CandidateFeatures> = {}): CandidateFeatures {
  return {
    keywordIds: [],
    keywordNames: {},
    peopleIds: [],
    peopleNames: {},
    runtime: 120,
    ...overrides,
  };
}

const profile = buildTasteProfile([
  makeTitle({
    tmdbId: 1,
    title: "Severance",
    rating: 9,
    genreIds: [18, 878],
    keywordIds: [100, 101],
    peopleIds: [500],
    keywordNames: { 100: "dystopia", 101: "workplace" },
    peopleNames: { 500: "Ben Stiller" },
  }),
  makeTitle({
    tmdbId: 2,
    title: "Devs",
    rating: 8,
    genreIds: [18, 878],
    keywordIds: [100, 102],
    keywordNames: { 100: "dystopia", 102: "technology" },
  }),
]);

describe("scoreCandidate", () => {
  it("scores a thematically matching title above an unrelated one", () => {
    const onTaste = scoreCandidate(
      makeCandidate({ genreIds: [18, 878] }),
      makeFeatures({ keywordIds: [100, 101], keywordNames: { 100: "dystopia" } }),
      profile,
      GENRE_NAMES,
    );
    const offTaste = scoreCandidate(
      makeCandidate({ tmdbId: 901, genreIds: [27] }),
      makeFeatures({ keywordIds: [999] }),
      profile,
      GENRE_NAMES,
    );

    expect(onTaste.score).toBeGreaterThan(offTaste.score);
  });

  it("names the shared themes it matched on", () => {
    const scored = scoreCandidate(
      makeCandidate(),
      makeFeatures({ keywordIds: [100, 101], keywordNames: { 100: "dystopia", 101: "workplace" } }),
      profile,
      GENRE_NAMES,
    );

    expect(scored.matchedKeywords).toContain("dystopia");
    expect(scored.reasons.some((reason) => reason.kind === "keyword")).toBe(true);
  });

  it("credits the library title that surfaced the candidate, with its rating", () => {
    const scored = scoreCandidate(
      makeCandidate({
        sources: [
          { kind: "recommendation", weight: 1, anchorTitle: "Severance", anchorRating: 9 },
        ],
      }),
      makeFeatures(),
      profile,
      GENRE_NAMES,
    );

    expect(scored.via[0]).toEqual({ title: "Severance", rating: 9 });
    expect(scored.reasons[0].text).toContain("Severance");
    expect(scored.reasons[0].text).toContain("9/10");
  });

  it("always produces at least one reason", () => {
    const scored = scoreCandidate(
      makeCandidate({ sources: [{ kind: "trending", weight: 0.25 }], voteCount: 10 }),
      makeFeatures(),
      profile,
      GENRE_NAMES,
    );

    expect(scored.reasons.length).toBeGreaterThan(0);
  });

  it("keeps the display score inside 0-100", () => {
    const scored = scoreCandidate(
      makeCandidate({
        genreIds: [18, 878],
        voteAverage: 10,
        voteCount: 1_000_000,
        sources: Array.from({ length: 20 }, () => ({ kind: "recommendation" as const, weight: 1 })),
      }),
      makeFeatures({ keywordIds: [100, 101, 102], peopleIds: [500] }),
      profile,
      GENRE_NAMES,
    );

    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(100);
  });
});

describe("prescore", () => {
  it("does not let a 10.0 from a handful of votes beat a well-reviewed title", () => {
    const obscure = makeCandidate({ tmdbId: 1, voteAverage: 10, voteCount: 3 });
    const established = makeCandidate({ tmdbId: 2, voteAverage: 8.4, voteCount: 20_000 });

    expect(prescore(established, profile)).toBeGreaterThan(prescore(obscure, profile));
  });

  it("rewards candidates surfaced by several library titles", () => {
    const single = makeCandidate({ tmdbId: 1, sources: [{ kind: "recommendation", weight: 1 }] });
    const agreed = makeCandidate({
      tmdbId: 2,
      sources: [
        { kind: "recommendation", weight: 1 },
        { kind: "recommendation", weight: 1 },
        { kind: "similar", weight: 0.7 },
      ],
    });

    expect(prescore(agreed, profile)).toBeGreaterThan(prescore(single, profile));
  });
});

describe("diversify", () => {
  it("breaks up a run of near-identical titles", () => {
    const features = new Map<string, CandidateFeatures>();

    // Four clones of one franchise, plus one outlier that scores slightly lower.
    const clones = [1, 2, 3, 4].map((id) => {
      const candidate = makeCandidate({ tmdbId: id, genreIds: [18, 878] });
      features.set(candidate.key, makeFeatures({ keywordIds: [100, 101, 102] }));
      return { ...scoreCandidate(candidate, makeFeatures(), profile, GENRE_NAMES), score: 80 };
    });

    const outlier = makeCandidate({ tmdbId: 9, genreIds: [27] });
    features.set(outlier.key, makeFeatures({ keywordIds: [700, 701] }));
    const outlierScored = {
      ...scoreCandidate(outlier, makeFeatures(), profile, GENRE_NAMES),
      score: 70,
    };

    const picked = diversify([...clones, outlierScored], features, 3);

    expect(picked).toHaveLength(3);
    expect(picked[0].tmdbId).toBe(1);
    // The outlier is promoted ahead of the third clone despite its lower score.
    expect(picked.map((item) => item.tmdbId)).toContain(9);
  });

  it("returns everything it has when asked for more than exists", () => {
    const candidate = scoreCandidate(makeCandidate(), makeFeatures(), profile, GENRE_NAMES);
    expect(diversify([candidate], new Map(), 10)).toHaveLength(1);
  });
});

describe("IDF weighting", () => {
  // Profile likes two themes equally: 100 (ubiquitous) and 999 (rare).
  const evenProfile = buildTasteProfile([
    makeTitle({ tmdbId: 1, rating: 9, keywordIds: [100, 999], genreIds: [18] }),
  ]);

  // A pool where 100 sits on almost everything and 999 on one title.
  const pool = [
    [100, 1],
    [100, 2],
    [100, 3],
    [100, 4],
    [100, 5],
    [999],
  ];
  const idf = { genres: {}, keywords: buildIdf(pool) };

  it("ranks a match on the rare theme above a match on the ubiquitous one", () => {
    const common = scoreCandidate(
      makeCandidate({ tmdbId: 1 }),
      makeFeatures({ keywordIds: [100] }),
      evenProfile,
      GENRE_NAMES,
      idf,
    );
    const rare = scoreCandidate(
      makeCandidate({ tmdbId: 2 }),
      makeFeatures({ keywordIds: [999] }),
      evenProfile,
      GENRE_NAMES,
      idf,
    );

    expect(rare.breakdown.keywords).toBeGreaterThan(common.breakdown.keywords);
    expect(rare.score).toBeGreaterThan(common.score);
  });

  it("without IDF the two are indistinguishable, which is the bug it fixes", () => {
    const common = scoreCandidate(
      makeCandidate({ tmdbId: 1 }),
      makeFeatures({ keywordIds: [100] }),
      evenProfile,
      GENRE_NAMES,
    );
    const rare = scoreCandidate(
      makeCandidate({ tmdbId: 2 }),
      makeFeatures({ keywordIds: [999] }),
      evenProfile,
      GENRE_NAMES,
    );

    expect(rare.breakdown.keywords).toBeCloseTo(common.breakdown.keywords, 10);
  });

  it("names the rare theme in the explanation ahead of the common one", () => {
    const both = scoreCandidate(
      makeCandidate(),
      makeFeatures({
        keywordIds: [100, 999],
        keywordNames: { 100: "drama", 999: "corporate dystopia" },
      }),
      evenProfile,
      GENRE_NAMES,
      idf,
    );

    expect(both.matchedKeywords[0]).toBe("corporate dystopia");
  });
});

describe("novelty", () => {
  it("gives a lesser-known title an edge over a blockbuster, all else equal", () => {
    const profile = buildTasteProfile([makeTitle({ rating: 9, genreIds: [18] })]);
    const blockbuster = scoreCandidate(
      makeCandidate({ tmdbId: 1, voteCount: 250_000, voteAverage: 7.5 }),
      makeFeatures(),
      profile,
      GENRE_NAMES,
    );
    const lesserKnown = scoreCandidate(
      makeCandidate({ tmdbId: 2, voteCount: 1_200, voteAverage: 7.5 }),
      makeFeatures(),
      profile,
      GENRE_NAMES,
    );

    expect(lesserKnown.breakdown.novelty).toBeGreaterThan(blockbuster.breakdown.novelty);
  });

  it("does not outweigh a genuine thematic match", () => {
    const profile = buildTasteProfile([
      makeTitle({ rating: 9, keywordIds: [100, 101], genreIds: [18] }),
    ]);
    const obscureNoMatch = scoreCandidate(
      makeCandidate({ tmdbId: 1, voteCount: 60, genreIds: [27] }),
      makeFeatures({ keywordIds: [777] }),
      profile,
      GENRE_NAMES,
    );
    const popularGoodMatch = scoreCandidate(
      makeCandidate({ tmdbId: 2, voteCount: 90_000, genreIds: [18] }),
      makeFeatures({ keywordIds: [100, 101] }),
      profile,
      GENRE_NAMES,
    );

    expect(popularGoodMatch.score).toBeGreaterThan(obscureNoMatch.score);
  });
});

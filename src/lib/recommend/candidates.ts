import "server-only";

import { discover, getTrending, tmdbGetSafe } from "@/lib/tmdb/server";
import { normalizeSearchResult } from "@/lib/tmdb/normalize";
import type {
  MediaType,
  NormalizedTitle,
  TmdbPaginated,
  TmdbSearchResult,
} from "@/lib/tmdb/types";
import { titleId } from "@/lib/library/types";

import { topEntries } from "./vector";
import type { ProfileAnchor, TasteProfile } from "./profile";

export type CandidateSourceKind = "recommendation" | "similar" | "discover" | "trending";

export interface CandidateSource {
  kind: CandidateSourceKind;
  /** Present for anchor-derived sources: the library title that surfaced this. */
  anchorTitle?: string;
  anchorTmdbId?: number;
  anchorRating?: number | null;
  weight: number;
}

export interface Candidate extends NormalizedTitle {
  key: string;
  sources: CandidateSource[];
}

type QueryValue = string | number | boolean | undefined | null;

/** How many library titles seed the "more like this" fan-out. */
const ANCHOR_LIMIT = 12;

/**
 * Two pages of TMDB's own recommendations plus one of /similar per anchor.
 * A deep pool is what makes "keep scrolling" possible: each page of results
 * enriches the next slice, so the pool has to be several hundred titles.
 */
const ANCHOR_QUERIES = [
  { endpoint: "recommendations", page: 1 },
  { endpoint: "recommendations", page: 2 },
  { endpoint: "similar", page: 1 },
] as const;

const DISCOVER_PAGES = [1, 2] as const;
const GENRE_SEEDS = 3;
const KEYWORD_SEEDS = 6;

/** TMDB endpoints differ in precision; weight their output accordingly. */
const SOURCE_WEIGHT: Record<CandidateSourceKind, number> = {
  recommendation: 1,
  similar: 0.7,
  discover: 0.5,
  trending: 0.25,
};

function collect(
  pool: Map<string, Candidate>,
  results: TmdbSearchResult[] | undefined,
  mediaType: MediaType | undefined,
  source: CandidateSource,
  exclude: Set<string>,
): void {
  for (const result of results ?? []) {
    if (result.media_type === "person") continue;
    const normalized = normalizeSearchResult(result, mediaType);
    if (!normalized) continue;

    const key = titleId(normalized.mediaType, normalized.tmdbId);
    if (exclude.has(key)) continue;

    const existing = pool.get(key);
    if (existing) {
      existing.sources.push(source);
    } else {
      pool.set(key, { ...normalized, key, sources: [source] });
    }
  }
}

function anchorSource(anchor: ProfileAnchor, kind: CandidateSourceKind): CandidateSource {
  return {
    kind,
    anchorTitle: anchor.title,
    anchorTmdbId: anchor.tmdbId,
    anchorRating: anchor.rating,
    // Stronger opinions produce more trustworthy neighbours.
    weight: SOURCE_WEIGHT[kind] * Math.min(1, anchor.signal),
  };
}

/**
 * Fan out across TMDB to assemble the pool the scorer will rank.
 *
 * Three complementary strategies: neighbours of titles the user already loves,
 * discovery by their dominant genres and keywords, and a small trending tail so
 * a thin library still produces something.
 */
export async function generateCandidates(profile: TasteProfile): Promise<Candidate[]> {
  const pool = new Map<string, Candidate>();
  const exclude = new Set(profile.excludeIds);
  const anchors = profile.anchors.slice(0, ANCHOR_LIMIT);

  const anchorRequests = anchors.flatMap((anchor) =>
    ANCHOR_QUERIES.map(async ({ endpoint, page: pageNumber }) => {
      const page = await tmdbGetSafe<TmdbPaginated<TmdbSearchResult>>(
        `${anchor.mediaType}/${anchor.tmdbId}/${endpoint}`,
        { page: pageNumber },
        { revalidate: 60 * 60 * 12 },
      );
      return {
        results: page?.results,
        mediaType: anchor.mediaType,
        source: anchorSource(anchor, endpoint === "similar" ? "similar" : "recommendation"),
      };
    }),
  );

  const topGenres = topEntries(profile.genres, GENRE_SEEDS).map((entry) => entry.id);
  const topKeywords = topEntries(profile.keywords, KEYWORD_SEEDS).map((entry) => entry.id);

  const wantsTv = profile.mediaMix.tv > 0;
  const wantsMovies = profile.mediaMix.movie > 0 || !wantsTv;
  const discoverTypes: MediaType[] = [
    ...(wantsMovies ? (["movie"] as const) : []),
    ...(wantsTv ? (["tv"] as const) : []),
  ];

  const discoverRequests = discoverTypes.flatMap((mediaType) =>
    DISCOVER_PAGES.flatMap((pageNumber) => {
      const requests: Promise<{
        results?: TmdbSearchResult[];
        mediaType: MediaType;
        source: CandidateSource;
      }>[] = [];

      const run = (
        params: Record<string, QueryValue>,
        weight: number,
      ): Promise<{
        results?: TmdbSearchResult[];
        mediaType: MediaType;
        source: CandidateSource;
      }> => {
        const source: CandidateSource = { kind: "discover", weight };
        return discover(mediaType, { ...params, page: pageNumber })
          .then((page) => ({ results: page.results, mediaType, source }))
          .catch(() => ({ results: undefined, mediaType, source }));
      };

      if (topGenres.length > 0) {
        requests.push(
          run(
            {
              with_genres: topGenres.join("|"),
              sort_by: "vote_average.desc",
              "vote_count.gte": 300,
            },
            SOURCE_WEIGHT.discover,
          ),
        );
      }

      if (topKeywords.length > 0) {
        requests.push(
          run(
            {
              with_keywords: topKeywords.join("|"),
              sort_by: "popularity.desc",
              // Raised from 80: below this the keyword feed is mostly
              // straight-to-streaming filler nobody wants recommended.
              "vote_count.gte": 250,
            },
            SOURCE_WEIGHT.discover * 1.2,
          ),
        );
      }

      return requests;
    }),
  );

  const trendingRequest = getTrending("week")
    .then((page) => ({
      results: page.results,
      mediaType: undefined,
      source: { kind: "trending" as const, weight: SOURCE_WEIGHT.trending },
    }))
    .catch(() => ({
      results: undefined,
      mediaType: undefined,
      source: { kind: "trending" as const, weight: SOURCE_WEIGHT.trending },
    }));

  const batches = await Promise.all([
    ...anchorRequests,
    ...discoverRequests,
    trendingRequest,
  ]);

  for (const batch of batches) {
    collect(pool, batch.results, batch.mediaType, batch.source, exclude);
  }

  return [...pool.values()];
}

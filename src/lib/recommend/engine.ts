import "server-only";

import type { TrackedTitle } from "@/lib/library/types";
import { extractFeatures } from "@/lib/tmdb/normalize";
import { getGenres, tmdbGetSafe } from "@/lib/tmdb/server";
import type { MediaType, TmdbTitleDetail } from "@/lib/tmdb/types";

import { generateCandidates, type Candidate } from "./candidates";
import { buildTasteProfile, describeProfile, type TasteProfile } from "./profile";
import {
  diversify,
  prescore,
  scoreCandidate,
  type CandidateFeatures,
  type ScoredCandidate,
} from "./score";

/** Detail fetches are the expensive step, so only the most promising slice is enriched. */
const ENRICH_LIMIT = 40;
const ENRICH_CONCURRENCY = 8;

export interface RecommendationFilters {
  mediaType?: MediaType | "all";
  /** Only consider titles released in or after this year. */
  minYear?: number;
  /** Drop anything below this TMDB vote count. Guards against obscure noise. */
  minVotes?: number;
  limit?: number;
}

export interface RecommendationResult {
  recommendations: ScoredCandidate[];
  profile: ReturnType<typeof describeProfile> & {
    sampleSize: number;
    ratedCount: number;
    eraCenter: number | null;
    anchors: { title: string; rating: number | null; posterPath: string | null }[];
  };
  poolSize: number;
  enrichedCount: number;
  generatedAt: string;
}

async function loadGenreNames(): Promise<Record<number, string>> {
  const [movies, shows] = await Promise.all([
    getGenres("movie").catch(() => ({ genres: [] })),
    getGenres("tv").catch(() => ({ genres: [] })),
  ]);
  const names: Record<number, string> = {};
  for (const genre of [...movies.genres, ...shows.genres]) names[genre.id] = genre.name;
  return names;
}

/** Bounded-concurrency map, so a 40-title enrich pass does not open 40 sockets at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function enrich(candidate: Candidate): Promise<CandidateFeatures | null> {
  const detail = await tmdbGetSafe<TmdbTitleDetail>(
    `${candidate.mediaType}/${candidate.tmdbId}`,
    { append_to_response: "credits,keywords" },
    { revalidate: 60 * 60 * 24 },
  );
  if (!detail) return null;

  const features = extractFeatures(detail);
  return {
    keywordIds: features.keywordIds,
    keywordNames: features.keywordNames,
    peopleIds: features.peopleIds,
    peopleNames: features.peopleNames,
    runtime: features.runtime,
  };
}

function passesFilters(candidate: Candidate, filters: RecommendationFilters): boolean {
  if (filters.mediaType && filters.mediaType !== "all" && candidate.mediaType !== filters.mediaType) {
    return false;
  }
  if (filters.minYear && (candidate.year ?? 0) < filters.minYear) return false;
  if (filters.minVotes && candidate.voteCount < filters.minVotes) return false;
  return true;
}

/**
 * Full pipeline: profile the library, fan out for candidates, cheaply rank them,
 * enrich the shortlist with keywords and credits, score properly, then
 * diversify the final list.
 */
export async function recommend(
  library: TrackedTitle[],
  filters: RecommendationFilters = {},
): Promise<RecommendationResult> {
  const limit = Math.min(filters.limit ?? 24, 50);
  const profile = buildTasteProfile(library);
  const [genreNames, pool] = await Promise.all([
    loadGenreNames(),
    generateCandidates(profile),
  ]);

  const eligible = pool.filter((candidate) => passesFilters(candidate, filters));

  const shortlist = eligible
    .map((candidate) => ({ candidate, pre: prescore(candidate, profile) }))
    .sort((a, b) => b.pre - a.pre)
    .slice(0, ENRICH_LIMIT)
    .map((entry) => entry.candidate);

  const enriched = await mapWithConcurrency(shortlist, ENRICH_CONCURRENCY, enrich);

  const featuresByKey = new Map<string, CandidateFeatures>();
  const scored: ScoredCandidate[] = [];

  shortlist.forEach((candidate, index) => {
    const features = enriched[index];
    if (!features) return;
    featuresByKey.set(candidate.key, features);
    scored.push(scoreCandidate(candidate, features, profile, genreNames));
  });

  return {
    recommendations: diversify(scored, featuresByKey, limit),
    profile: {
      ...describeProfile(profile, genreNames),
      sampleSize: profile.sampleSize,
      ratedCount: profile.ratedCount,
      eraCenter: profile.eraCenter ? Math.round(profile.eraCenter) : null,
      anchors: profile.anchors.slice(0, 6).map((anchor) => ({
        title: anchor.title,
        rating: anchor.rating,
        posterPath: anchor.posterPath,
      })),
    },
    poolSize: pool.length,
    enrichedCount: featuresByKey.size,
    generatedAt: new Date().toISOString(),
  };
}

export type { TasteProfile, ScoredCandidate };

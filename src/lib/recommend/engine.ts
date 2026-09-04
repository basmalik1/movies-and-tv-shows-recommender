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
  type IdfTables,
  type RecommendationItem,
  type ScoredCandidate,
} from "./score";
import type { RecommendationSource } from "./sources";
import { rankTmdbCandidates, toRecommendationItem } from "./tmdb-ranking";
import { collectTmdbCandidates } from "./tmdb-source";
import { buildIdf } from "./vector";

/** Detail fetches are the expensive step, so each page enriches only a slice. */
const ENRICH_PER_PAGE = 40;
const ENRICH_CONCURRENCY = 8;
const DEFAULT_PAGE_SIZE = 24;

export interface RecommendationFilters {
  mediaType?: MediaType | "all";
  /** Only consider titles released in or after this year. */
  minYear?: number;
  /** Drop anything below this TMDB vote count. Guards against obscure noise. */
  minVotes?: number;
  limit?: number;
  /** Zero-based page. Each page enriches and ranks the next slice of the pool. */
  page?: number;
  /** Keys already shown to the user, so scrolling never repeats a title. */
  excludeKeys?: string[];
  /** Which engine ranks the results. Defaults to the custom model. */
  source?: RecommendationSource;
}

export interface RecommendationResult {
  recommendations: RecommendationItem[];
  source: RecommendationSource;
  profile: ReturnType<typeof describeProfile> & {
    sampleSize: number;
    ratedCount: number;
    eraCenter: number | null;
    anchors: { title: string; rating: number | null; posterPath: string | null }[];
  };
  page: number;
  hasMore: boolean;
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

function passesFilters(
  candidate: Pick<Candidate, "mediaType" | "year" | "voteCount">,
  filters: RecommendationFilters,
): boolean {
  if (filters.mediaType && filters.mediaType !== "all" && candidate.mediaType !== filters.mediaType) {
    return false;
  }
  if (filters.minYear && (candidate.year ?? 0) < filters.minYear) return false;
  if (filters.minVotes && candidate.voteCount < filters.minVotes) return false;
  return true;
}

/**
 * Full pipeline: profile the library, fan out for candidates, cheaply rank them,
 * enrich one page worth of the shortlist with keywords and credits, score
 * properly, then diversify.
 *
 * Paging works by advancing through the prescored pool rather than re-ranking
 * from scratch, so "load more" costs one enrich pass and never repeats a title.
 */
export async function recommend(
  library: TrackedTitle[],
  filters: RecommendationFilters = {},
): Promise<RecommendationResult> {
  const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, 50);
  const page = Math.max(0, Math.min(filters.page ?? 0, 25));
  const excluded = new Set(filters.excludeKeys ?? []);

  const profile = buildTasteProfile(library);

  if (filters.source === "tmdb") {
    return recommendFromTmdb(profile, filters, { limit, page, excluded });
  }

  const [genreNames, pool] = await Promise.all([
    loadGenreNames(),
    generateCandidates(profile),
  ]);

  const eligible = pool.filter(
    (candidate) => passesFilters(candidate, filters) && !excluded.has(candidate.key),
  );

  // Genre IDF over the actual pool: "Drama" on 80% of candidates tells us far
  // less about fit than a genre that only a handful of them share.
  const genreIdf = buildIdf(eligible.map((candidate) => candidate.genreIds));

  const ranked = eligible
    .map((candidate) => ({ candidate, pre: prescore(candidate, profile, genreIdf) }))
    .sort((a, b) => b.pre - a.pre)
    .map((entry) => entry.candidate);

  const start = page * ENRICH_PER_PAGE;
  const shortlist = ranked.slice(start, start + ENRICH_PER_PAGE);
  const enriched = await mapWithConcurrency(shortlist, ENRICH_CONCURRENCY, enrich);

  const featuresByKey = new Map<string, CandidateFeatures>();
  const usable: { candidate: Candidate; features: CandidateFeatures }[] = [];

  shortlist.forEach((candidate, index) => {
    const features = enriched[index];
    if (!features) return;
    featuresByKey.set(candidate.key, features);
    usable.push({ candidate, features });
  });

  // Keyword IDF from the enriched slice, for the same reason as genres:
  // "workplace" across half the shortlist is weak evidence, a tag on two of
  // them is strong.
  const idf: IdfTables = {
    genres: genreIdf,
    keywords: buildIdf(usable.map((entry) => entry.features.keywordIds)),
  };

  const scored = usable.map((entry) =>
    scoreCandidate(entry.candidate, entry.features, profile, genreNames, idf),
  );

  return {
    recommendations: diversify(scored, featuresByKey, limit),
    source: "reel",
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
    page,
    hasMore: ranked.length > start + ENRICH_PER_PAGE,
    poolSize: pool.length,
    enrichedCount: featuresByKey.size,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * TMDB passthrough. No enrichment and no scoring, so the whole ranked list is
 * built in one go and paging is a slice of it.
 */
async function recommendFromTmdb(
  profile: TasteProfile,
  filters: RecommendationFilters,
  { limit, page, excluded }: { limit: number; page: number; excluded: Set<string> },
): Promise<RecommendationResult> {
  const [genreNames, candidates] = await Promise.all([
    loadGenreNames(),
    collectTmdbCandidates(profile, new Set([...profile.excludeIds, ...excluded])),
  ]);

  // Filtering is not ranking, so the same media/era/popularity controls apply
  // here without compromising the passthrough as a baseline.
  const ranked = rankTmdbCandidates(
    candidates.filter((candidate) => passesFilters(candidate, filters)),
  );
  const start = page * limit;

  return {
    recommendations: ranked.slice(start, start + limit).map(toRecommendationItem),
    source: "tmdb",
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
    page,
    hasMore: ranked.length > start + limit,
    poolSize: ranked.length,
    enrichedCount: 0,
    generatedAt: new Date().toISOString(),
  };
}

export type { TasteProfile, ScoredCandidate, RecommendationItem };

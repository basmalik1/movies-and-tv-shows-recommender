import { isSignalKeyword, normalizeKeywordName } from "./keywords";
import type {
  MediaType,
  NormalizedTitle,
  TmdbMovieDetail,
  TmdbSearchResult,
  TmdbTitleDetail,
  TmdbTvDetail,
} from "./types";

export function isTvDetail(detail: TmdbTitleDetail): detail is TmdbTvDetail {
  return "name" in detail && !("title" in detail);
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) && year > 1870 ? year : null;
}

/** Search results carry `media_type` only on /search/multi; callers supply a fallback. */
export function normalizeSearchResult(
  result: TmdbSearchResult,
  fallbackMediaType?: MediaType,
): NormalizedTitle | null {
  const mediaType =
    result.media_type === "movie" || result.media_type === "tv"
      ? result.media_type
      : fallbackMediaType;
  if (!mediaType) return null;

  const date = (mediaType === "tv" ? result.first_air_date : result.release_date) || null;

  return {
    tmdbId: result.id,
    mediaType,
    title: result.title ?? result.name ?? "Untitled",
    overview: result.overview ?? "",
    posterPath: result.poster_path ?? null,
    backdropPath: result.backdrop_path ?? null,
    date,
    year: yearOf(date),
    voteAverage: result.vote_average ?? 0,
    voteCount: result.vote_count ?? 0,
    popularity: result.popularity ?? 0,
    genreIds: result.genre_ids ?? [],
    originalLanguage: result.original_language ?? "en",
  };
}

export function normalizeDetail(detail: TmdbTitleDetail): NormalizedTitle {
  const tv = isTvDetail(detail);
  const date = (tv ? detail.first_air_date : (detail as TmdbMovieDetail).release_date) || null;

  return {
    tmdbId: detail.id,
    mediaType: tv ? "tv" : "movie",
    title: tv ? detail.name : (detail as TmdbMovieDetail).title,
    overview: detail.overview ?? "",
    posterPath: detail.poster_path ?? null,
    backdropPath: detail.backdrop_path ?? null,
    date,
    year: yearOf(date),
    voteAverage: detail.vote_average ?? 0,
    voteCount: detail.vote_count ?? 0,
    popularity: detail.popularity ?? 0,
    genreIds: (detail.genres ?? []).map((g) => g.id),
    originalLanguage: detail.original_language ?? "en",
  };
}

/** Signals the recommender learns from. Extracted once, at the moment a title is tracked. */
export interface TitleFeatures {
  genreIds: number[];
  keywordIds: number[];
  keywordNames: Record<number, string>;
  /** Top-billed cast plus directors / creators, weighted equally. */
  peopleIds: number[];
  peopleNames: Record<number, string>;
  runtime: number | null;
  year: number | null;
  originalLanguage: string;
}

const TOP_CAST_COUNT = 8;
/**
 * Authorship roles only. Producers are deliberately excluded: they correlate
 * with studio and budget rather than with anything a viewer responds to, and
 * they were polluting the profile with names like line producers.
 */
const AUTHOR_JOBS = new Set(["Director", "Writer", "Screenplay", "Story", "Creator"]);

export function extractFeatures(detail: TmdbTitleDetail): TitleFeatures {
  const tv = isTvDetail(detail);
  const normalized = normalizeDetail(detail);

  const rawKeywords = tv
    ? (detail.keywords?.results ?? [])
    : ((detail as TmdbMovieDetail).keywords?.keywords ?? []);
  const keywords = rawKeywords.filter((keyword) => isSignalKeyword(keyword.name));

  const keywordNames: Record<number, string> = {};
  for (const keyword of keywords) keywordNames[keyword.id] = normalizeKeywordName(keyword.name);

  const peopleNames: Record<number, string> = {};
  const peopleIds: number[] = [];

  for (const member of (detail.credits?.cast ?? []).slice(0, TOP_CAST_COUNT)) {
    peopleNames[member.id] = member.name;
    peopleIds.push(member.id);
  }
  for (const member of detail.credits?.crew ?? []) {
    if (member.job && AUTHOR_JOBS.has(member.job) && !peopleNames[member.id]) {
      peopleNames[member.id] = member.name;
      peopleIds.push(member.id);
    }
  }
  for (const creator of tv ? (detail.created_by ?? []) : []) {
    if (!peopleNames[creator.id]) {
      peopleNames[creator.id] = creator.name;
      peopleIds.push(creator.id);
    }
  }

  const runtime = tv
    ? (detail.episode_run_time?.[0] ?? null)
    : ((detail as TmdbMovieDetail).runtime ?? null);

  return {
    genreIds: normalized.genreIds,
    keywordIds: keywords.map((k) => k.id),
    keywordNames,
    peopleIds,
    peopleNames,
    runtime,
    year: normalized.year,
    originalLanguage: normalized.originalLanguage,
  };
}

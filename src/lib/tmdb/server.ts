import "server-only";

import type {
  MediaType,
  TmdbMovieDetail,
  TmdbPaginated,
  TmdbSearchResult,
  TmdbSeasonDetail,
  TmdbTvDetail,
} from "./types";

const BASE_URL = "https://api.themoviedb.org/3";

export class TmdbConfigError extends Error {
  constructor() {
    super(
      "TMDB credentials are missing. Copy .env.example to .env.local and set TMDB_ACCESS_TOKEN.",
    );
    this.name = "TmdbConfigError";
  }
}

export class TmdbRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TmdbRequestError";
  }
}

export function hasTmdbCredentials(): boolean {
  return Boolean(process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY);
}

type QueryValue = string | number | boolean | undefined | null;

/**
 * Single entry point for talking to TMDB. Credentials never leave the server:
 * the browser reaches TMDB only through /api/tmdb, which calls back into this.
 */
export async function tmdbGet<T>(
  path: string,
  params: Record<string, QueryValue> = {},
  { revalidate = 60 * 60 }: { revalidate?: number | false } = {},
): Promise<T> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) throw new TmdbConfigError();

  const url = new URL(`${BASE_URL}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  if (!token && apiKey) url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new TmdbRequestError(
      response.status,
      `TMDB ${response.status} for /${path}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

/** Same as tmdbGet but resolves to null instead of throwing. Used for best-effort fan-out. */
export async function tmdbGetSafe<T>(
  path: string,
  params?: Record<string, QueryValue>,
  options?: { revalidate?: number | false },
): Promise<T | null> {
  try {
    return await tmdbGet<T>(path, params, options);
  } catch {
    return null;
  }
}

const DETAIL_APPEND = "credits,keywords,recommendations,similar";

export function getMovie(id: number) {
  return tmdbGet<TmdbMovieDetail>(`movie/${id}`, {
    append_to_response: DETAIL_APPEND,
  });
}

export function getTvShow(id: number) {
  return tmdbGet<TmdbTvDetail>(`tv/${id}`, {
    append_to_response: DETAIL_APPEND,
  });
}

export function getSeason(showId: number, seasonNumber: number) {
  return tmdbGet<TmdbSeasonDetail>(`tv/${showId}/season/${seasonNumber}`, {}, {
    revalidate: 60 * 60 * 6,
  });
}

export function searchTitles(query: string, page = 1) {
  return tmdbGet<TmdbPaginated<TmdbSearchResult>>(
    "search/multi",
    { query, page, include_adult: false },
    { revalidate: 60 * 10 },
  );
}

export function getTrending(window: "day" | "week" = "week") {
  return tmdbGet<TmdbPaginated<TmdbSearchResult>>(
    `trending/all/${window}`,
    {},
    { revalidate: 60 * 60 * 3 },
  );
}

export function discover(
  mediaType: MediaType,
  params: Record<string, QueryValue>,
) {
  return tmdbGet<TmdbPaginated<TmdbSearchResult>>(`discover/${mediaType}`, {
    include_adult: false,
    "vote_count.gte": 50,
    ...params,
  });
}

export function getGenres(mediaType: MediaType) {
  return tmdbGet<{ genres: { id: number; name: string }[] }>(
    `genre/${mediaType}/list`,
    {},
    { revalidate: 60 * 60 * 24 * 7 },
  );
}

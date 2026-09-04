import type {
  MediaType,
  TmdbPaginated,
  TmdbSearchResult,
  TmdbSeasonDetail,
  TmdbTitleDetail,
} from "./types";

export class TmdbClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TmdbClientError";
  }
}

/** Browser-side reads go through /api/tmdb so credentials stay on the server. */
export async function fetchTmdb<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();

  const response = await fetch(`/api/tmdb/${path}${query ? `?${query}` : ""}`, { signal });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new TmdbClientError(
      body.error ?? `Request failed (${response.status})`,
      response.status,
      body.code,
    );
  }

  return (await response.json()) as T;
}

export function searchTitles(query: string, page = 1, signal?: AbortSignal) {
  return fetchTmdb<TmdbPaginated<TmdbSearchResult>>("search/multi", { query, page }, signal);
}

export function fetchTitleDetail(mediaType: MediaType, id: number, signal?: AbortSignal) {
  return fetchTmdb<TmdbTitleDetail>(
    `${mediaType}/${id}`,
    { append_to_response: "credits,keywords" },
    signal,
  );
}

export function fetchSeason(showId: number, seasonNumber: number, signal?: AbortSignal) {
  return fetchTmdb<TmdbSeasonDetail>(`tv/${showId}/season/${seasonNumber}`, {}, signal);
}

export function fetchTrending(signal?: AbortSignal) {
  return fetchTmdb<TmdbPaginated<TmdbSearchResult>>("trending/all/week", {}, signal);
}

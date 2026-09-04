import { NextResponse } from "next/server";

import type { TrackedTitle } from "@/lib/library/types";
import { recommend, type RecommendationFilters } from "@/lib/recommend/engine";
import { hasTmdbCredentials } from "@/lib/tmdb/server";

/** The library lives in the browser, so it arrives with each request. Keep it bounded. */
const MAX_LIBRARY_SIZE = 2000;

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : [];
}

function asNameMap(value: unknown): Record<number, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<number, string> = {};
  for (const [key, name] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(key);
    if (Number.isFinite(id) && typeof name === "string") out[id] = name;
  }
  return out;
}

/**
 * Hand-rolled validation rather than a schema dependency: the payload is small,
 * fully owned by this app, and every field has a safe fallback.
 */
function parseTitle(raw: unknown): TrackedTitle | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const tmdbId = Number(value.tmdbId);
  const mediaType = value.mediaType;
  if (!Number.isFinite(tmdbId)) return null;
  if (mediaType !== "movie" && mediaType !== "tv") return null;

  const status = value.status;
  const validStatus =
    status === "watchlist" || status === "watching" || status === "completed" || status === "dropped"
      ? status
      : "watchlist";

  const rating = typeof value.rating === "number" ? Math.min(10, Math.max(1, value.rating)) : null;

  return {
    id: typeof value.id === "string" ? value.id : `${mediaType}:${tmdbId}`,
    tmdbId,
    mediaType,
    title: typeof value.title === "string" ? value.title : "Untitled",
    posterPath: typeof value.posterPath === "string" ? value.posterPath : null,
    backdropPath: typeof value.backdropPath === "string" ? value.backdropPath : null,
    date: typeof value.date === "string" ? value.date : null,
    year: typeof value.year === "number" ? value.year : null,
    status: validStatus,
    rating,
    notes: "",
    genreIds: asNumberArray(value.genreIds),
    keywordIds: asNumberArray(value.keywordIds),
    peopleIds: asNumberArray(value.peopleIds),
    keywordNames: asNameMap(value.keywordNames),
    peopleNames: asNameMap(value.peopleNames),
    runtime: typeof value.runtime === "number" ? value.runtime : null,
    originalLanguage:
      typeof value.originalLanguage === "string" ? value.originalLanguage : "en",
    totalEpisodes: null,
    totalSeasons: null,
    watchedEpisodes: [],
    seasons: [],
    lastAiredEpisode: null,
    nextAiredEpisode: null,
    showStatus: null,
    inProduction: false,
    addedAt: typeof value.addedAt === "number" ? value.addedAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
    completedAt: typeof value.completedAt === "number" ? value.completedAt : null,
    lastWatchedAt: typeof value.lastWatchedAt === "number" ? value.lastWatchedAt : null,
  };
}

function parseFilters(raw: unknown): RecommendationFilters {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const mediaType = value.mediaType;

  return {
    mediaType:
      mediaType === "movie" || mediaType === "tv" || mediaType === "all" ? mediaType : "all",
    minYear: typeof value.minYear === "number" ? value.minYear : undefined,
    minVotes: typeof value.minVotes === "number" ? value.minVotes : undefined,
    limit: typeof value.limit === "number" ? value.limit : undefined,
  };
}

export async function POST(request: Request) {
  if (!hasTmdbCredentials()) {
    return NextResponse.json(
      {
        error:
          "TMDB is not configured. Copy .env.example to .env.local and set TMDB_ACCESS_TOKEN, then restart the dev server.",
        code: "tmdb_not_configured",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const rawLibrary = Array.isArray(payload.library) ? payload.library : [];

  if (rawLibrary.length > MAX_LIBRARY_SIZE) {
    return NextResponse.json(
      { error: `Library too large (max ${MAX_LIBRARY_SIZE} titles).` },
      { status: 413 },
    );
  }

  const library = rawLibrary
    .map(parseTitle)
    .filter((title): title is TrackedTitle => title !== null);

  if (library.length === 0) {
    return NextResponse.json(
      {
        error: "Track and rate a few titles first — recommendations need something to learn from.",
        code: "empty_library",
      },
      { status: 422 },
    );
  }

  try {
    const result = await recommend(library, parseFilters(payload.filters));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not build recommendations: ${message}` },
      { status: 502 },
    );
  }
}

import { extractFeatures, isTvDetail, normalizeDetail } from "@/lib/tmdb/normalize";
import type { TmdbTitleDetail } from "@/lib/tmdb/types";

import { titleId, type TrackedTitle, type WatchStatus } from "./types";

/**
 * Build (or refresh) a library record from a TMDB detail payload.
 *
 * Passing `existing` preserves everything the user authored — status, rating,
 * notes, ticked episodes — while pulling in fresh metadata such as newly
 * announced seasons and air dates.
 */
export function trackedTitleFromDetail(
  detail: TmdbTitleDetail,
  {
    status,
    existing,
    now = Date.now(),
  }: { status?: WatchStatus; existing?: TrackedTitle; now?: number } = {},
): TrackedTitle {
  const normalized = normalizeDetail(detail);
  const features = extractFeatures(detail);
  const tv = isTvDetail(detail);
  const nextStatus = status ?? existing?.status ?? "watchlist";

  const seasons = tv
    ? (detail.seasons ?? []).map((season) => ({
        seasonNumber: season.season_number,
        name: season.name,
        episodeCount: season.episode_count,
        airDate: season.air_date ?? null,
      }))
    : [];

  const lastAired = tv && detail.last_episode_to_air
    ? {
        season: detail.last_episode_to_air.season_number,
        episode: detail.last_episode_to_air.episode_number,
      }
    : null;

  const nextAired = tv && detail.next_episode_to_air
    ? {
        season: detail.next_episode_to_air.season_number,
        episode: detail.next_episode_to_air.episode_number,
        name: detail.next_episode_to_air.name,
        airDate: detail.next_episode_to_air.air_date ?? null,
      }
    : null;

  const becameComplete = nextStatus === "completed" && existing?.status !== "completed";

  return {
    id: titleId(normalized.mediaType, normalized.tmdbId),
    tmdbId: normalized.tmdbId,
    mediaType: normalized.mediaType,
    title: normalized.title,
    posterPath: normalized.posterPath,
    backdropPath: normalized.backdropPath,
    date: normalized.date,
    year: normalized.year,

    status: nextStatus,
    rating: existing?.rating ?? null,
    notes: existing?.notes ?? "",

    genreIds: features.genreIds,
    keywordIds: features.keywordIds,
    peopleIds: features.peopleIds,
    keywordNames: features.keywordNames,
    peopleNames: features.peopleNames,
    runtime: features.runtime,
    originalLanguage: features.originalLanguage,

    totalEpisodes: tv ? (detail.number_of_episodes ?? null) : null,
    totalSeasons: tv ? (detail.number_of_seasons ?? null) : null,
    watchedEpisodes: existing?.watchedEpisodes ?? [],
    seasons,
    lastAiredEpisode: lastAired,
    nextAiredEpisode: nextAired,
    showStatus: tv ? (detail.status ?? null) : null,
    inProduction: tv ? Boolean(detail.in_production) : false,

    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
    completedAt: becameComplete ? now : (existing?.completedAt ?? null),
    lastWatchedAt: existing?.lastWatchedAt ?? null,
  };
}

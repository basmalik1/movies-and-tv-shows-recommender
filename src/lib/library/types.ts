import type { MediaType } from "@/lib/tmdb/types";

export type WatchStatus = "watchlist" | "watching" | "completed" | "dropped";

export const WATCH_STATUSES: WatchStatus[] = [
  "watchlist",
  "watching",
  "completed",
  "dropped",
];

export const STATUS_LABELS: Record<WatchStatus, string> = {
  watchlist: "Watchlist",
  watching: "Watching",
  completed: "Completed",
  dropped: "Dropped",
};

/** "1x03" — season 1, episode 3. Stable, human-readable, cheap to diff. */
export type EpisodeKey = string;

export function episodeKey(season: number, episode: number): EpisodeKey {
  return `${season}x${episode}`;
}

export function parseEpisodeKey(key: EpisodeKey): { season: number; episode: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(key);
  if (!match) return null;
  return { season: Number(match[1]), episode: Number(match[2]) };
}

export function titleId(mediaType: MediaType, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

/**
 * A title the user has put in their library.
 *
 * Genre / keyword / people ids are denormalized onto the record at track time so
 * the recommender can build a taste profile without re-fetching every title.
 */
export interface TrackedTitle {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  /** Release date / first air date, ISO. */
  date: string | null;
  year: number | null;

  status: WatchStatus;
  /** User score out of 10. null means "tracked but not rated". */
  rating: number | null;
  notes: string;

  genreIds: number[];
  keywordIds: number[];
  peopleIds: number[];
  /** Only ids the profile might need to name in an explanation. */
  keywordNames: Record<number, string>;
  peopleNames: Record<number, string>;
  runtime: number | null;
  originalLanguage: string;

  /** TV only. */
  totalEpisodes: number | null;
  totalSeasons: number | null;
  watchedEpisodes: EpisodeKey[];
  /** Season shape snapshot, so episode progress can be computed offline. */
  seasons: TrackedSeason[];
  /** Most recent episode that has already aired. Bounds "caught up" checks. */
  lastAiredEpisode: EpisodeRef | null;
  /** The show's next scheduled episode, if TMDB knows of one. */
  nextAiredEpisode: UpcomingEpisode | null;
  /** TMDB show status, e.g. "Returning Series", "Ended". */
  showStatus: string | null;
  inProduction: boolean;

  addedAt: number;
  updatedAt: number;
  completedAt: number | null;
  lastWatchedAt: number | null;
}

export interface TrackedSeason {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
}

export interface EpisodeRef {
  season: number;
  episode: number;
}

export interface UpcomingEpisode extends EpisodeRef {
  name: string;
  airDate: string | null;
}

export interface LibraryExport {
  version: 1;
  exportedAt: string;
  titles: TrackedTitle[];
}

/**
 * Persistence boundary. The app only ever talks to this interface, so swapping
 * IndexedDB for a hosted database later is a single implementation change.
 */
export interface LibraryRepository {
  list(): Promise<TrackedTitle[]>;
  get(id: string): Promise<TrackedTitle | undefined>;
  put(title: TrackedTitle): Promise<void>;
  putMany(titles: TrackedTitle[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

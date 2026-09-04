import { episodeKey, type EpisodeKey, type TrackedTitle } from "./types";

export interface WatchProgress {
  /** Episodes the user has ticked off. */
  watched: number;
  /** Episodes that exist and have already aired. */
  aired: number;
  /** Episodes TMDB knows about at all, including unaired ones. */
  total: number;
  /** 0-100, measured against aired episodes (the only ones it is possible to watch). */
  percent: number;
  caughtUp: boolean;
}

/** Specials live in season 0 and are excluded unless the user has explicitly watched some. */
function relevantSeasons(title: TrackedTitle) {
  const watchedSpecials = title.watchedEpisodes.some((key) => key.startsWith("0x"));
  return title.seasons
    .filter((season) => season.seasonNumber > 0 || watchedSpecials)
    .filter((season) => season.episodeCount > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

function hasAired(
  season: number,
  episode: number,
  title: TrackedTitle,
  today: string,
): boolean {
  const last = title.lastAiredEpisode;
  if (last) {
    return season < last.season || (season === last.season && episode <= last.episode);
  }
  // No airing data (common for finished shows): fall back to the season air date.
  const seasonInfo = title.seasons.find((s) => s.seasonNumber === season);
  if (!seasonInfo?.airDate) return true;
  return seasonInfo.airDate <= today;
}

/** Every episode key that has aired, in broadcast order. */
export function airedEpisodeKeys(title: TrackedTitle, now = new Date()): EpisodeKey[] {
  const today = now.toISOString().slice(0, 10);
  const keys: EpisodeKey[] = [];
  for (const season of relevantSeasons(title)) {
    for (let episode = 1; episode <= season.episodeCount; episode += 1) {
      if (hasAired(season.seasonNumber, episode, title, today)) {
        keys.push(episodeKey(season.seasonNumber, episode));
      }
    }
  }
  return keys;
}

export function progressFor(title: TrackedTitle, now = new Date()): WatchProgress {
  if (title.mediaType === "movie") {
    const watched = title.status === "completed" ? 1 : 0;
    return {
      watched,
      aired: 1,
      total: 1,
      percent: watched * 100,
      caughtUp: watched === 1,
    };
  }

  const aired = airedEpisodeKeys(title, now);
  const airedSet = new Set(aired);
  const watchedSet = new Set(title.watchedEpisodes);
  const watched = [...watchedSet].filter((key) => airedSet.has(key)).length;
  const total =
    title.totalEpisodes ??
    relevantSeasons(title).reduce((sum, season) => sum + season.episodeCount, 0);

  return {
    watched,
    aired: aired.length,
    total: Math.max(total, aired.length),
    percent: aired.length === 0 ? 0 : Math.round((watched / aired.length) * 100),
    caughtUp: aired.length > 0 && watched >= aired.length,
  };
}

/** The next episode the user could sit down and watch right now, if any. */
export function nextEpisodeToWatch(
  title: TrackedTitle,
  now = new Date(),
): { season: number; episode: number; key: EpisodeKey } | null {
  if (title.mediaType === "movie") return null;
  const watchedSet = new Set(title.watchedEpisodes);
  for (const key of airedEpisodeKeys(title, now)) {
    if (!watchedSet.has(key)) {
      const [season, episode] = key.split("x").map(Number);
      return { season, episode, key };
    }
  }
  return null;
}

/** All episode keys in a season, used by the "mark whole season" control. */
export function seasonEpisodeKeys(title: TrackedTitle, seasonNumber: number): EpisodeKey[] {
  const season = title.seasons.find((s) => s.seasonNumber === seasonNumber);
  if (!season) return [];
  return Array.from({ length: season.episodeCount }, (_, index) =>
    episodeKey(seasonNumber, index + 1),
  );
}

export function formatEpisodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

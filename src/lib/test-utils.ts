import type { TrackedTitle, WatchStatus } from "./library/types";

export const DAY = 86_400_000;

/** Builds a TrackedTitle with sane defaults so tests only state what they care about. */
export function makeTitle(overrides: Partial<TrackedTitle> = {}): TrackedTitle {
  const mediaType = overrides.mediaType ?? "movie";
  const tmdbId = overrides.tmdbId ?? 1;
  const now = overrides.updatedAt ?? Date.now();

  return {
    id: `${mediaType}:${tmdbId}`,
    tmdbId,
    mediaType,
    title: "Untitled",
    posterPath: null,
    backdropPath: null,
    date: "2020-01-01",
    year: 2020,
    status: "completed" as WatchStatus,
    rating: null,
    notes: "",
    genreIds: [],
    keywordIds: [],
    peopleIds: [],
    keywordNames: {},
    peopleNames: {},
    runtime: null,
    originalLanguage: "en",
    totalEpisodes: null,
    totalSeasons: null,
    watchedEpisodes: [],
    seasons: [],
    lastAiredEpisode: null,
    nextAiredEpisode: null,
    showStatus: null,
    inProduction: false,
    addedAt: now,
    updatedAt: now,
    completedAt: null,
    lastWatchedAt: null,
    ...overrides,
  };
}

/** A show with `count` seasons of `episodesPerSeason` episodes each. */
export function makeShow(
  overrides: Partial<TrackedTitle> & { seasonCount?: number; episodesPerSeason?: number } = {},
): TrackedTitle {
  const { seasonCount = 2, episodesPerSeason = 10, ...rest } = overrides;

  return makeTitle({
    mediaType: "tv",
    seasons: Array.from({ length: seasonCount }, (_, index) => ({
      seasonNumber: index + 1,
      name: `Season ${index + 1}`,
      episodeCount: episodesPerSeason,
      airDate: `20${20 + index}-01-01`,
    })),
    totalEpisodes: seasonCount * episodesPerSeason,
    totalSeasons: seasonCount,
    lastAiredEpisode: { season: seasonCount, episode: episodesPerSeason },
    ...rest,
  });
}

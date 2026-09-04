import type { MediaType } from "@/lib/tmdb/types";

import { formatEpisodeCode } from "./library/progress";
import type { TrackedTitle } from "./library/types";

export type UpcomingKind = "episode" | "season-premiere" | "movie-release";

export interface UpcomingEntry {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  kind: UpcomingKind;
  /** ISO yyyy-mm-dd. */
  date: string;
  headline: string;
  detail: string | null;
  daysAway: number;
}

export interface UpcomingSchedule {
  /** Grouped by date, soonest first. */
  days: { date: string; entries: UpcomingEntry[] }[];
  /** Renewed or in production, but TMDB has no air date yet. */
  unscheduled: TrackedTitle[];
  total: number;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/**
 * Turn the library into a forward-looking schedule.
 *
 * Everything here is derived from metadata already cached on each tracked
 * title, so the page renders instantly and works offline; a Refresh in
 * Settings is what pulls newly announced dates from TMDB.
 */
export function buildSchedule(
  titles: TrackedTitle[],
  { now = new Date(), horizonDays = 180 }: { now?: Date; horizonDays?: number } = {},
): UpcomingSchedule {
  const today = isoDay(now);
  const entries: UpcomingEntry[] = [];
  const unscheduled: TrackedTitle[] = [];

  for (const title of titles) {
    if (title.status === "dropped") continue;

    if (title.mediaType === "movie") {
      // Only unwatched films can still be "upcoming" for you.
      if (title.status === "completed" || !title.date || title.date < today) continue;
      entries.push({
        id: `${title.id}:release`,
        tmdbId: title.tmdbId,
        mediaType: "movie",
        title: title.title,
        posterPath: title.posterPath,
        kind: "movie-release",
        date: title.date,
        headline: "In cinemas",
        detail: null,
        daysAway: daysBetween(today, title.date),
      });
      continue;
    }

    const next = title.nextAiredEpisode;
    if (next?.airDate && next.airDate >= today) {
      const premiere = next.episode === 1;
      entries.push({
        id: `${title.id}:${next.season}x${next.episode}`,
        tmdbId: title.tmdbId,
        mediaType: "tv",
        title: title.title,
        posterPath: title.posterPath,
        kind: premiere ? "season-premiere" : "episode",
        date: next.airDate,
        headline: premiere
          ? `Season ${next.season} premiere`
          : formatEpisodeCode(next.season, next.episode),
        detail: next.name || null,
        daysAway: daysBetween(today, next.airDate),
      });
      continue;
    }

    // Announced-but-unaired seasons that TMDB has not surfaced as "next episode".
    const announced = title.seasons
      .filter((season) => season.seasonNumber > 0 && season.airDate && season.airDate > today)
      .sort((a, b) => (a.airDate ?? "").localeCompare(b.airDate ?? ""))[0];

    if (announced?.airDate) {
      entries.push({
        id: `${title.id}:s${announced.seasonNumber}`,
        tmdbId: title.tmdbId,
        mediaType: "tv",
        title: title.title,
        posterPath: title.posterPath,
        kind: "season-premiere",
        date: announced.airDate,
        headline: `${announced.name} premiere`,
        detail: `${announced.episodeCount} episodes`,
        daysAway: daysBetween(today, announced.airDate),
      });
      continue;
    }

    if (title.inProduction || title.showStatus === "Returning Series") {
      unscheduled.push(title);
    }
  }

  const withinHorizon = entries
    .filter((entry) => entry.daysAway <= horizonDays)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const byDate = new Map<string, UpcomingEntry[]>();
  for (const entry of withinHorizon) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  return {
    days: [...byDate.entries()].map(([date, dayEntries]) => ({ date, entries: dayEntries })),
    unscheduled: unscheduled.sort((a, b) => a.title.localeCompare(b.title)),
    total: withinHorizon.length,
  };
}

export function formatRelativeDay(date: string, now = new Date()): string {
  const days = daysBetween(isoDay(now), date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return `In ${Math.round(days / 7)} weeks`;
}

export function formatDateHeading(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

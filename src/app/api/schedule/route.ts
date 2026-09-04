import { NextResponse } from "next/server";

import { formatEpisodeCode } from "@/lib/library/progress";
import { getSeason, hasTmdbCredentials } from "@/lib/tmdb/server";
import type { UpcomingEntry } from "@/lib/upcoming";

/**
 * Expands a season into its individual episode air dates.
 *
 * A series detail from TMDB carries only `next_episode_to_air`, which is enough
 * for an agenda list but leaves a calendar almost empty — a weekly show should
 * appear four or five times in a month. The season endpoint has every date, so
 * this route fetches the seasons the client asks for and returns one entry per
 * episode inside the requested window.
 */

const MAX_SHOWS = 60;
const MAX_SEASONS_PER_SHOW = 3;
const CONCURRENCY = 6;

interface ShowRequest {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasonNumbers: number[];
}

function parseShows(raw: unknown): ShowRequest[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      const tmdbId = Number(value.tmdbId);
      if (!Number.isInteger(tmdbId) || tmdbId <= 0) return [];

      const seasonNumbers = Array.isArray(value.seasonNumbers)
        ? value.seasonNumbers
            .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0)
            .slice(0, MAX_SEASONS_PER_SHOW)
        : [];
      if (seasonNumbers.length === 0) return [];

      return [
        {
          tmdbId,
          title: typeof value.title === "string" ? value.title : "Untitled",
          posterPath: typeof value.posterPath === "string" ? value.posterPath : null,
          seasonNumbers,
        },
      ];
    })
    .slice(0, MAX_SHOWS);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

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

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
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
  if (!isIsoDate(payload.from) || !isIsoDate(payload.to)) {
    return NextResponse.json(
      { error: "`from` and `to` must be yyyy-mm-dd dates." },
      { status: 400 },
    );
  }

  const { from, to } = payload;
  if (from > to) {
    return NextResponse.json({ error: "`from` must not be after `to`." }, { status: 400 });
  }

  const shows = parseShows(payload.shows);
  if (shows.length === 0) return NextResponse.json({ entries: [] });

  const today = new Date().toISOString().slice(0, 10);

  // One job per show/season pair, so a show with two relevant seasons does not
  // serialise behind another show's fetches.
  const jobs = shows.flatMap((show) =>
    show.seasonNumbers.map((seasonNumber) => ({ show, seasonNumber })),
  );

  const collected = await mapWithConcurrency(jobs, CONCURRENCY, async ({ show, seasonNumber }) => {
    try {
      const season = await getSeason(show.tmdbId, seasonNumber);
      return (season.episodes ?? [])
        .filter((episode) => isIsoDate(episode.air_date) && episode.air_date >= from && episode.air_date <= to)
        .map<UpcomingEntry>((episode) => ({
          id: `tv:${show.tmdbId}:${episode.season_number}x${episode.episode_number}`,
          tmdbId: show.tmdbId,
          mediaType: "tv",
          title: show.title,
          posterPath: show.posterPath,
          kind: episode.episode_number === 1 ? "season-premiere" : "episode",
          date: episode.air_date as string,
          headline: formatEpisodeCode(episode.season_number, episode.episode_number),
          detail: episode.name || null,
          daysAway: daysBetween(today, episode.air_date as string),
        }));
    } catch {
      // A single unavailable season should not blank the whole month.
      return [];
    }
  });

  const entries = collected
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  return NextResponse.json({ entries });
}

"use client";

import { useEffect, useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import { formatEpisodeCode, progressFor, seasonEpisodeKeys } from "@/lib/library/progress";
import { episodeKey, titleId } from "@/lib/library/types";
import { fetchSeason } from "@/lib/tmdb/client";
import type { TmdbEpisode, TmdbTvDetail } from "@/lib/tmdb/types";

import { CheckIcon, ChevronIcon } from "./icons";
import { ErrorNotice, ProgressBar, Spinner } from "./ui";

function airLabel(episode: TmdbEpisode, today: string): string {
  if (!episode.air_date) return "TBA";
  if (episode.air_date > today) {
    return new Date(`${episode.air_date}T00:00:00Z`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return new Date(`${episode.air_date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function SeasonPanel({
  show,
  seasonNumber,
  seasonName,
  episodeCount,
  libraryId,
  defaultOpen,
}: {
  show: TmdbTvDetail;
  seasonNumber: number;
  seasonName: string;
  episodeCount: number;
  libraryId: string;
  defaultOpen: boolean;
}) {
  const { byId, toggleEpisode, setEpisodes, markWatchedThrough } = useLibrary();
  const [open, setOpen] = useState(defaultOpen);
  const [episodes, setEpisodes_] = useState<TmdbEpisode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Derived rather than stored: an open season is loading until it has either
   * episodes or an error. This keeps the fetch effect free of synchronous
   * state updates and cascading renders.
   */
  const loading = open && episodes === null && error === null;

  const tracked = byId.get(libraryId);
  const watched = new Set(tracked?.watchedEpisodes ?? []);
  const today = new Date().toISOString().slice(0, 10);

  const seasonWatched = Array.from({ length: episodeCount }, (_, index) =>
    episodeKey(seasonNumber, index + 1),
  ).filter((key) => watched.has(key)).length;

  // Episodes are fetched the first time a season is expanded, not up front:
  // a long-running show would otherwise cost a request per season on mount.
  useEffect(() => {
    if (!open || episodes !== null || error !== null) return;
    const controller = new AbortController();

    fetchSeason(show.id, seasonNumber, controller.signal)
      .then((detail) => setEpisodes_(detail.episodes ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not load this season from TMDB.");
      });

    return () => controller.abort();
  }, [open, episodes, error, show.id, seasonNumber]);

  const keys = tracked ? seasonEpisodeKeys(tracked, seasonNumber) : [];
  const allWatched = keys.length > 0 && seasonWatched === keys.length;

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-800/50"
      >
        <ChevronIcon
          width={16}
          height={16}
          className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="flex-1 text-sm font-medium text-ink-100">{seasonName}</span>
        <span className="text-xs tabular-nums text-ink-400">
          {seasonWatched} / {episodeCount}
        </span>
        {allWatched && <CheckIcon width={15} height={15} className="text-emerald-400" />}
      </button>

      {open && (
        <div className="border-t border-ink-800 px-4 py-3">
          {tracked && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void setEpisodes(libraryId, keys, !allWatched)}
              >
                {allWatched ? "Unmark whole season" : "Mark whole season watched"}
              </button>
            </div>
          )}

          {loading && <Spinner label="Loading episodes…" />}
          {error && <ErrorNotice>{error}</ErrorNotice>}

          {episodes && (
            <ul className="divide-y divide-ink-800">
              {episodes.map((episode) => {
                const key = episodeKey(episode.season_number, episode.episode_number);
                const isWatched = watched.has(key);
                const unaired = Boolean(episode.air_date && episode.air_date > today);

                return (
                  <li key={episode.id} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={isWatched}
                      disabled={!tracked}
                      aria-label={`Mark ${formatEpisodeCode(episode.season_number, episode.episode_number)} watched`}
                      onChange={() =>
                        void toggleEpisode(
                          libraryId,
                          episode.season_number,
                          episode.episode_number,
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-sky-500 disabled:opacity-40"
                    />
                    <span className="w-14 shrink-0 font-mono text-[0.7rem] text-ink-400">
                      {formatEpisodeCode(episode.season_number, episode.episode_number)}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        unaired ? "text-ink-400" : "text-ink-200"
                      }`}
                    >
                      {episode.name}
                    </span>
                    {tracked && !isWatched && !unaired && (
                      <button
                        type="button"
                        title="Mark this and everything before it as watched"
                        className="shrink-0 text-[0.7rem] text-ink-400 hover:text-accent-400"
                        onClick={() =>
                          void markWatchedThrough(
                            libraryId,
                            episode.season_number,
                            episode.episode_number,
                          )
                        }
                      >
                        up to here
                      </button>
                    )}
                    <span className="w-20 shrink-0 text-right text-[0.7rem] text-ink-400">
                      {airLabel(episode, today)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function EpisodeTracker({ show }: { show: TmdbTvDetail }) {
  const { byId, ready } = useLibrary();
  const libraryId = titleId("tv", show.id);
  const tracked = byId.get(libraryId);

  const seasons = (show.seasons ?? [])
    .filter((season) => season.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);

  if (seasons.length === 0) return null;

  const progress = tracked ? progressFor(tracked) : null;
  const currentSeason = tracked?.lastAiredEpisode?.season ?? seasons[seasons.length - 1].season_number;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-300">Episodes</h2>
        {progress && progress.aired > 0 && (
          <span className="text-xs tabular-nums text-ink-400">
            {progress.watched} / {progress.aired} aired · {progress.percent}%
          </span>
        )}
      </div>

      {progress && progress.aired > 0 && (
        <div className="mb-4">
          <ProgressBar percent={progress.percent} />
        </div>
      )}

      {ready && !tracked && (
        <p className="mb-3 text-xs text-ink-400">
          Add this series to your library above to start ticking off episodes.
        </p>
      )}

      <div className="space-y-2">
        {seasons.map((season) => (
          <SeasonPanel
            key={season.id}
            show={show}
            seasonNumber={season.season_number}
            seasonName={season.name}
            episodeCount={season.episode_count}
            libraryId={libraryId}
            defaultOpen={season.season_number === currentSeason && seasons.length > 1}
          />
        ))}
      </div>
    </section>
  );
}

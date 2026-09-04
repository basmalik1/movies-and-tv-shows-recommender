"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import { formatEpisodeCode, nextEpisodeToWatch, progressFor } from "@/lib/library/progress";
import type { NormalizedTitle } from "@/lib/tmdb/types";
import { buildSchedule, formatRelativeDay } from "@/lib/upcoming";

import { CheckIcon, SparkIcon } from "./icons";
import { TitleCard, TitleGrid } from "./TitleCard";
import { EmptyState, PageHeader, Poster, ProgressBar, SectionHeader, Spinner } from "./ui";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[0.7rem] font-medium uppercase tracking-widest text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

function ContinueWatchingCard({ titleId }: { titleId: string }) {
  const { byId, toggleEpisode } = useLibrary();
  const [busy, setBusy] = useState(false);
  const title = byId.get(titleId);

  if (!title) return null;
  const next = nextEpisodeToWatch(title);
  const progress = progressFor(title);

  async function markWatched() {
    if (!next || !title) return;
    setBusy(true);
    try {
      await toggleEpisode(title.id, next.season, next.episode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex gap-3 p-3">
      <Link
        href={`/title/${title.mediaType}/${title.tmdbId}`}
        className="relative h-[96px] w-16 shrink-0 overflow-hidden rounded-md bg-ink-800"
      >
        <Poster path={title.posterPath} alt={title.title} sizes="64px" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/title/${title.mediaType}/${title.tmdbId}`}
            className="block truncate text-sm font-medium text-ink-100 hover:text-accent-400"
          >
            {title.title}
          </Link>
          <p className="mt-0.5 text-xs text-ink-400">
            {next ? `Up next · ${formatEpisodeCode(next.season, next.episode)}` : "All caught up"}
          </p>
        </div>

        <div className="space-y-2">
          <ProgressBar
            percent={progress.percent}
            label={`${progress.watched} of ${progress.aired} aired episodes`}
          />
          {next && (
            <button
              type="button"
              className="btn btn-ghost w-full"
              disabled={busy}
              onClick={() => void markWatched()}
            >
              <CheckIcon width={14} height={14} />
              Mark {formatEpisodeCode(next.season, next.episode)} watched
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardView({ trending }: { trending: NormalizedTitle[] }) {
  const { titles, ready } = useLibrary();

  const continueWatching = useMemo(
    () =>
      titles
        .filter((title) => title.mediaType === "tv" && title.status === "watching")
        .map((title) => ({ title, next: nextEpisodeToWatch(title) }))
        .filter((entry) => entry.next !== null)
        .sort(
          (a, b) =>
            (b.title.lastWatchedAt ?? b.title.updatedAt) -
            (a.title.lastWatchedAt ?? a.title.updatedAt),
        )
        .slice(0, 6),
    [titles],
  );

  const soon = useMemo(
    () => buildSchedule(titles, { horizonDays: 14 }).days.flatMap((day) => day.entries).slice(0, 6),
    [titles],
  );

  const stats = useMemo(() => {
    const episodes = titles.reduce((sum, title) => sum + title.watchedEpisodes.length, 0);
    const films = titles.filter(
      (title) => title.mediaType === "movie" && title.status === "completed",
    );
    const filmMinutes = films.reduce((sum, title) => sum + (title.runtime ?? 110), 0);
    const episodeMinutes = titles.reduce(
      (sum, title) => sum + title.watchedEpisodes.length * (title.runtime ?? 42),
      0,
    );
    const rated = titles.filter((title) => title.rating !== null);
    const average =
      rated.length > 0
        ? rated.reduce((sum, title) => sum + (title.rating ?? 0), 0) / rated.length
        : null;

    return {
      tracked: titles.length,
      episodes,
      films: films.length,
      hours: Math.round((filmMinutes + episodeMinutes) / 60),
      average,
    };
  }, [titles]);

  if (!ready) return <Spinner label="Opening your library…" />;

  if (titles.length === 0) {
    return (
      <div>
        <PageHeader
          title="Welcome to Reel"
          description="Track what you watch, follow what is coming next, and get recommendations that explain themselves."
        />

        <div className="card mb-9 grid gap-4 p-6 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Track what you have seen",
              body: "Search for films and series, mark them watched, and rate the ones you have an opinion about.",
            },
            {
              step: "2",
              title: "Follow what is next",
              body: "Tick off episodes as you go. Upcoming shows every announced episode and season for your shows.",
            },
            {
              step: "3",
              title: "Get explained picks",
              body: "Your ratings become a taste profile, and every recommendation says which of your titles led there.",
            },
          ].map((item) => (
            <div key={item.step}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-600 text-xs font-bold text-ink-950">
                {item.step}
              </span>
              <h3 className="mt-2.5 text-sm font-semibold text-ink-100">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 flex gap-2">
          <Link href="/search" className="btn btn-primary">
            Search for something you have watched
          </Link>
        </div>

        {trending.length > 0 && (
          <section>
            <SectionHeader title="Trending this week" hint="A starting point" />
            <TitleGrid>
              {trending.slice(0, 12).map((title, index) => (
                <TitleCard
                  key={`${title.mediaType}-${title.tmdbId}`}
                  tmdbId={title.tmdbId}
                  mediaType={title.mediaType}
                  title={title.title}
                  posterPath={title.posterPath}
                  year={title.year}
                  priority={index < 6}
                />
              ))}
            </TitleGrid>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Home"
        actions={
          <Link href="/recommendations" className="btn btn-primary">
            <SparkIcon width={15} height={15} />
            Find something to watch
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tracked" value={String(stats.tracked)} />
        <StatCard label="Episodes" value={stats.episodes.toLocaleString()} />
        <StatCard label="Films seen" value={String(stats.films)} />
        <StatCard
          label="Time watched"
          value={`${stats.hours.toLocaleString()}h`}
          hint={stats.average ? `Average rating ${stats.average.toFixed(1)}` : undefined}
        />
      </section>

      {continueWatching.length > 0 && (
        <section>
          <SectionHeader title="Continue watching" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {continueWatching.map((entry) => (
              <ContinueWatchingCard key={entry.title.id} titleId={entry.title.id} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title="Airing soon"
          action={
            <Link href="/upcoming" className="text-xs text-accent-400 hover:underline">
              Full schedule
            </Link>
          }
        />
        {soon.length === 0 ? (
          <EmptyState title="Nothing airing in the next fortnight">
            Air dates come from TMDB and refresh from the Upcoming page.
          </EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {soon.map((entry) => (
              <Link
                key={entry.id}
                href={`/title/${entry.mediaType}/${entry.tmdbId}`}
                className="card flex items-center gap-3 p-2.5 transition-colors hover:border-ink-600"
              >
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-800">
                  <Poster path={entry.posterPath} alt={entry.title} sizes="40px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-100">{entry.title}</p>
                  <p className="truncate text-xs text-ink-400">{entry.headline}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-400">
                  {formatRelativeDay(entry.date)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import {
  buildSchedule,
  formatDateHeading,
  formatRelativeDay,
  type UpcomingEntry,
} from "@/lib/upcoming";

import { RefreshIcon } from "./icons";
import { EmptyState, PageHeader, Poster, Spinner } from "./ui";

const KIND_STYLES: Record<UpcomingEntry["kind"], string> = {
  episode: "border-ink-600 bg-ink-800 text-ink-300",
  "season-premiere": "border-accent-600/40 bg-accent-600/15 text-accent-400",
  "movie-release": "border-gold-500/30 bg-gold-500/10 text-gold-400",
};

function EntryRow({ entry }: { entry: UpcomingEntry }) {
  return (
    <Link
      href={`/title/${entry.mediaType}/${entry.tmdbId}`}
      className="card flex items-center gap-3 p-2.5 transition-colors hover:border-ink-600"
    >
      <div className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-md bg-ink-800">
        <Poster path={entry.posterPath} alt={entry.title} sizes="48px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-100">{entry.title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-400">
          <span className={`chip mr-1.5 ${KIND_STYLES[entry.kind]}`}>{entry.headline}</span>
          {entry.detail}
        </p>
      </div>
      <span className="shrink-0 text-xs text-ink-400">{formatRelativeDay(entry.date)}</span>
    </Link>
  );
}

export function UpcomingView() {
  const { titles, ready, refreshAll } = useLibrary();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const schedule = useMemo(() => buildSchedule(titles), [titles]);

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      const count = await refreshAll();
      setMessage(`Checked ${count} ${count === 1 ? "title" : "titles"} for new air dates.`);
    } catch {
      setMessage("Could not reach TMDB. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }

  if (!ready) {
    return (
      <div>
        <PageHeader title="Upcoming" />
        <Spinner label="Reading your library…" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Upcoming"
        description="Episodes and releases ahead for everything you track, for the next six months."
        actions={
          titles.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshIcon width={15} height={15} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh air dates"}
            </button>
          ) : null
        }
      />

      {message && <p className="mb-4 text-sm text-ink-400">{message}</p>}

      {schedule.total === 0 && schedule.unscheduled.length === 0 ? (
        <EmptyState title="Nothing scheduled">
          {titles.length === 0 ? (
            <>
              Track a few series from{" "}
              <Link href="/search" className="text-accent-400 underline underline-offset-2">
                Search
              </Link>{" "}
              and their air dates will show up here.
            </>
          ) : (
            "None of your tracked titles have an announced date right now. Try refreshing air dates."
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-7">
            {schedule.days.map((day) => (
              <section key={day.date}>
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-ink-200">
                    {formatDateHeading(day.date)}
                  </h2>
                  <span className="text-xs text-ink-400">{formatRelativeDay(day.date)}</span>
                </div>
                <div className="space-y-2">
                  {day.entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {schedule.unscheduled.length > 0 && (
            <aside>
              <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-ink-300">
                Renewed, no date yet
              </h2>
              <div className="card divide-y divide-ink-800">
                {schedule.unscheduled.map((title) => (
                  <Link
                    key={title.id}
                    href={`/title/tv/${title.tmdbId}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-ink-800/60"
                  >
                    <span className="truncate text-ink-200">{title.title}</span>
                    <span className="shrink-0 text-[0.7rem] text-ink-400">
                      {title.showStatus ?? "In production"}
                    </span>
                  </Link>
                ))}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

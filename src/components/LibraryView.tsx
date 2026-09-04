"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import { progressFor } from "@/lib/library/progress";
import { STATUS_LABELS, WATCH_STATUSES, type WatchStatus } from "@/lib/library/types";

import { TitleCard, TitleGrid } from "./TitleCard";
import { EmptyState, PageHeader, ProgressBar, Spinner } from "./ui";

type StatusFilter = WatchStatus | "all";
type TypeFilter = "all" | "movie" | "tv";
type SortKey = "recent" | "rating" | "title" | "year";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently updated" },
  { value: "rating", label: "Highest rated" },
  { value: "title", label: "A–Z" },
  { value: "year", label: "Newest release" },
];

export function LibraryView() {
  const { titles, ready } = useLibrary();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: titles.length,
      watchlist: 0,
      watching: 0,
      completed: 0,
      dropped: 0,
    };
    for (const title of titles) base[title.status] += 1;
    return base;
  }, [titles]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = titles.filter((title) => {
      if (status !== "all" && title.status !== status) return false;
      if (type !== "all" && title.mediaType !== type) return false;
      if (needle && !title.title.toLowerCase().includes(needle)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sort) {
        case "rating":
          return (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title);
        case "title":
          return a.title.localeCompare(b.title);
        case "year":
          return (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title);
        default:
          return (b.lastWatchedAt ?? b.updatedAt) - (a.lastWatchedAt ?? a.updatedAt);
      }
    });
  }, [titles, status, type, query, sort]);

  if (!ready) {
    return (
      <div>
        <PageHeader title="Library" />
        <Spinner label="Opening your local library…" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Library"
        description={
          titles.length > 0
            ? `${titles.length} tracked ${titles.length === 1 ? "title" : "titles"} · ${counts.completed} completed`
            : undefined
        }
      />

      {titles.length === 0 ? (
        <EmptyState title="Your library is empty">
          <Link href="/search" className="text-accent-400 underline underline-offset-2">
            Search for something you have watched
          </Link>{" "}
          and rate it. Ten or so rated titles is enough for the recommender to find its footing.
        </EmptyState>
      ) : (
        <>
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...WATCH_STATUSES] as StatusFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  aria-pressed={status === option}
                  className={`btn ${status === option ? "btn-primary" : "btn-ghost"}`}
                >
                  {option === "all" ? "All" : STATUS_LABELS[option]}
                  <span className="ml-1 opacity-60">{counts[option]}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input sm:max-w-xs"
                type="search"
                value={query}
                placeholder="Filter by title…"
                aria-label="Filter your library"
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                className="input w-auto"
                value={type}
                aria-label="Media type"
                onChange={(event) => setType(event.target.value as TypeFilter)}
              >
                <option value="all">Films and series</option>
                <option value="movie">Films only</option>
                <option value="tv">Series only</option>
              </select>
              <select
                className="input w-auto"
                value={sort}
                aria-label="Sort order"
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState title="Nothing matches those filters" />
          ) : (
            <TitleGrid>
              {visible.map((title, index) => {
                const progress = progressFor(title);
                return (
                  <TitleCard
                    key={title.id}
                    tmdbId={title.tmdbId}
                    mediaType={title.mediaType}
                    title={title.title}
                    posterPath={title.posterPath}
                    year={title.year}
                    priority={index < 6}
                    footer={
                      title.mediaType === "tv" && progress.aired > 0 ? (
                        <ProgressBar
                          percent={progress.percent}
                          label={`${progress.watched} / ${progress.aired} aired`}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </TitleGrid>
          )}
        </>
      )}
    </div>
  );
}

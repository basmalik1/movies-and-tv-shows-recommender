"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { searchTitles, TmdbClientError } from "@/lib/tmdb/client";
import { normalizeSearchResult } from "@/lib/tmdb/normalize";
import type { NormalizedTitle } from "@/lib/tmdb/types";

import { TitleCard, TitleGrid } from "./TitleCard";
import { EmptyState, ErrorNotice, PageHeader, Spinner } from "./ui";

type Filter = "all" | "movie" | "tv";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "movie", label: "Films" },
  { value: "tv", label: "Series" },
];

export function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQuery = params.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [results, setResults] = useState<NormalizedTitle[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (term.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const page = await searchTitles(term.trim(), 1, controller.signal);
      const normalized = page.results
        .map((result) => normalizeSearchResult(result))
        .filter((title): title is NormalizedTitle => title !== null)
        // TMDB mixes in low-signal entries; keep anything with a poster or real votes.
        .filter((title) => title.posterPath !== null || title.voteCount > 0)
        .sort((a, b) => b.popularity - a.popularity);

      setResults(normalized);
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof TmdbClientError ? caught.message : "Search failed. Try again.",
      );
      setStatus("error");
    }
  }, []);

  // Debounce so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void run(query), 300);
    return () => clearTimeout(timer);
  }, [query, run]);

  // Keep the URL shareable without pushing a history entry per character.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search";
      router.replace(next, { scroll: false });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, router]);

  const visible = filter === "all" ? results : results.filter((r) => r.mediaType === filter);

  return (
    <div>
      <PageHeader
        title="Search"
        description="Find a film or series, then add it to your library. What you track shapes your recommendations."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input sm:max-w-md"
          type="search"
          value={query}
          autoFocus
          placeholder="Severance, Dune, The Bear…"
          aria-label="Search films and series"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={`btn ${filter === option.value ? "btn-primary" : "btn-ghost"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" && <Spinner label="Searching TMDB…" />}
      {error && <ErrorNotice>{error}</ErrorNotice>}

      {status === "idle" && !error && (
        <EmptyState title="Start typing to search">
          Results come from TMDB. Adding titles here is what teaches the recommender your taste.
        </EmptyState>
      )}

      {status === "done" && visible.length === 0 && (
        <EmptyState title={`Nothing found for “${query.trim()}”`}>
          Try a shorter query, or switch the filter back to Everything.
        </EmptyState>
      )}

      {visible.length > 0 && (
        <TitleGrid>
          {visible.map((title, index) => (
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
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import type { RecommendationResult } from "@/lib/recommend/engine";
import {
  RECOMMENDATION_SOURCES,
  SOURCE_LABELS,
  type RecommendationSource,
} from "@/lib/recommend/sources";

import { SparkIcon } from "./icons";
import { TitleCard, TitleGrid } from "./TitleCard";
import { EmptyState, ErrorNotice, PageHeader, Spinner } from "./ui";

type Recommendation = RecommendationResult["recommendations"][number];
type MediaFilter = "all" | "movie" | "tv";

interface Filters {
  source: RecommendationSource;
  mediaType: MediaFilter;
  minYear?: number;
  minVotes?: number;
}

const SOURCE_BLURB: Record<RecommendationSource, string> = {
  reel: "Ranked against your own taste profile, with the reasoning shown for every pick.",
  tmdb: "A straight passthrough of TMDB's own recommendation feed for the titles you liked, in TMDB's ordering. No taste profile, no scoring.",
};

/** Enough signal for the profile to mean something rather than echo one title. */
const MIN_USEFUL_LIBRARY = 3;

/** How close the end of the grid must get before the next page is requested. */
const LOAD_MORE_MARGIN = 600;

interface RunState {
  runId: number;
  items: Recommendation[];
  profile: RecommendationResult["profile"] | null;
  /** How many pages have come back for this run. */
  pagesLoaded: number;
  hasMore: boolean;
  poolSize: number;
  error: string | null;
}

const EMPTY_RUN: RunState = {
  runId: -1,
  items: [],
  profile: null,
  pagesLoaded: 0,
  hasMore: false,
  poolSize: 0,
  error: null,
};

function ScoreBadge({ score, source }: { score: number; source: RecommendationSource }) {
  const tone =
    score >= 75
      ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
      : score >= 55
        ? "border-accent-500/40 bg-accent-600/20 text-accent-300"
        : "border-ink-600 bg-ink-950/80 text-ink-300";

  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[0.7rem] font-bold tabular-nums backdrop-blur ${tone}`}
      title={
        source === "tmdb"
          ? "TMDB user rating — the passthrough computes no taste match"
          : "How closely this matches your taste profile"
      }
    >
      {source === "tmdb" ? (score / 10).toFixed(1) : score}
    </span>
  );
}

function ProfilePanel({ profile }: { profile: RecommendationResult["profile"] }) {
  return (
    <section className="card mb-7 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-ink-300">
        What your profile looks like
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-400">Genres</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.topGenres.map((genre) => (
              <span key={genre.id} className="chip">
                {genre.name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-400">Themes</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.topKeywords.slice(0, 8).map((keyword) => (
              <span key={keyword.id} className="chip">
                {keyword.name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-400">Names that keep coming up</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.topPeople.slice(0, 6).map((person) => (
              <span key={person.id} className="chip">
                {person.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 border-t border-ink-800 pt-3 text-xs text-ink-400">
        Built from {profile.sampleSize} tracked{" "}
        {profile.sampleSize === 1 ? "title" : "titles"} ({profile.ratedCount} rated)
        {profile.eraCenter ? ` centred on ${profile.eraCenter}` : ""}.
      </p>
    </section>
  );
}

export function RecommendationsView() {
  const { titles, ready } = useLibrary();
  const [filters, setFilters] = useState<Filters>({ source: "reel", mediaType: "all" });
  /** Bumped whenever the result set should be thrown away and rebuilt. */
  const [runId, setRunId] = useState(0);
  const [wantPage, setWantPage] = useState(0);
  const [run, setRun] = useState<RunState>(EMPTY_RUN);

  /**
   * The library is read at request time rather than tracked as a dependency:
   * rating one title should not silently re-run the whole pipeline.
   */
  const titlesRef = useRef(titles);
  useEffect(() => {
    titlesRef.current = titles;
  }, [titles]);

  const enabled = ready && titles.length >= MIN_USEFUL_LIBRARY;
  const isStale = run.runId !== runId;
  const needsPage = isStale || run.pagesLoaded <= wantPage;
  const loading = enabled && needsPage && run.error === null;

  // Everything below is derived, so the fetch effect never sets state synchronously.
  const items = isStale ? [] : run.items;
  const profile = isStale ? null : run.profile;

  useEffect(() => {
    if (!enabled || !needsPage || run.error !== null) return;

    const controller = new AbortController();
    const reset = run.runId !== runId;
    const page = reset ? 0 : wantPage;
    // Sending what has already been shown means a page can never repeat a title,
    // even if the pool shifted between requests.
    const excludeKeys = reset ? [] : run.items.map((item) => item.key);

    void (async () => {
      try {
        const response = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            library: titlesRef.current,
            filters: { ...filters, limit: 24, page, excludeKeys },
          }),
        });

        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not build recommendations.");
        const result = body as RecommendationResult;

        setRun((previous) => ({
          runId,
          items: reset ? result.recommendations : [...previous.items, ...result.recommendations],
          profile: result.profile,
          pagesLoaded: page + 1,
          hasMore: result.hasMore && result.recommendations.length > 0,
          poolSize: result.poolSize,
          error: null,
        }));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setRun((previous) => ({
          ...previous,
          runId,
          error: caught instanceof Error ? caught.message : "Something went wrong.",
        }));
      }
    })();

    return () => controller.abort();
  }, [enabled, needsPage, runId, wantPage, filters, run.runId, run.items, run.error]);

  const canLoadMore = !isStale && run.hasMore && !loading && run.error === null;

  // Pull the next page in as the sentinel nears the viewport.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canLoadMore) return;

    let requested = false;
    const request = () => {
      if (requested) return;
      const rect = node.getBoundingClientRect();
      if (rect.top - window.innerHeight < LOAD_MORE_MARGIN) {
        requested = true;
        setWantPage((page) => page + 1);
      }
    };

    /**
     * IntersectionObserver is the efficient path, but it does not run in every
     * environment — a backgrounded tab or an embedded webview can leave it
     * silently inert — so a throttled scroll check backs it up. Timers keep
     * firing where rAF and the observer do not.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) request();
      },
      { rootMargin: `${LOAD_MORE_MARGIN}px` },
    );
    observer.observe(node);

    let throttle: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (throttle !== null) return;
      throttle = setTimeout(() => {
        throttle = null;
        request();
      }, 150);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    /**
     * Covers a grid that already ends inside the viewport, where no scroll will
     * ever arrive. Staggered because posters load after mount and change the
     * page height under us — a single check on mount can measure too early.
     */
    const initialChecks = [0, 250, 800].map((delay) => setTimeout(request, delay));

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (throttle !== null) clearTimeout(throttle);
      for (const check of initialChecks) clearTimeout(check);
    };
  }, [canLoadMore]);

  function restart(next: Filters) {
    setFilters(next);
    setWantPage(0);
    setRunId((id) => id + 1);
  }

  if (!ready) {
    return (
      <div>
        <PageHeader title="For you" />
        <Spinner label="Reading your library…" />
      </div>
    );
  }

  if (titles.length < MIN_USEFUL_LIBRARY) {
    return (
      <div>
        <PageHeader title="For you" />
        <EmptyState title="Track a few titles first">
          The recommender learns from genres, themes, cast and crew across everything you have
          rated. Add at least {MIN_USEFUL_LIBRARY} titles from{" "}
          <Link href="/search" className="text-accent-400 underline underline-offset-2">
            Search
          </Link>{" "}
          — you have {titles.length} so far.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="For you"
        description={SOURCE_BLURB[filters.source]}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => restart(filters)}
          >
            <SparkIcon width={15} height={15} />
            {loading ? "Thinking…" : "Regenerate"}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-ink-400">
          Ranked by
        </span>
        <div
          role="radiogroup"
          aria-label="Recommendation engine"
          className="inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5"
        >
          {RECOMMENDATION_SOURCES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={filters.source === option}
              onClick={() => restart({ ...filters, source: option })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                filters.source === option
                  ? "bg-accent-600 text-ink-950"
                  : "text-ink-300 hover:text-ink-100"
              }`}
            >
              {SOURCE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["all", "movie", "tv"] as MediaFilter[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => restart({ ...filters, mediaType: option })}
            aria-pressed={filters.mediaType === option}
            className={`btn ${filters.mediaType === option ? "btn-primary" : "btn-ghost"}`}
          >
            {option === "all" ? "Everything" : option === "movie" ? "Films" : "Series"}
          </button>
        ))}

        <select
          className="input w-auto"
          aria-label="Earliest release year"
          value={filters.minYear ?? ""}
          onChange={(event) =>
            restart({
              ...filters,
              minYear: event.target.value ? Number(event.target.value) : undefined,
            })
          }
        >
          <option value="">Any era</option>
          <option value="2020">2020 and newer</option>
          <option value="2010">2010 and newer</option>
          <option value="2000">2000 and newer</option>
          <option value="1980">1980 and newer</option>
        </select>

        <select
          className="input w-auto"
          aria-label="Minimum popularity"
          value={filters.minVotes ?? ""}
          onChange={(event) =>
            restart({
              ...filters,
              minVotes: event.target.value ? Number(event.target.value) : undefined,
            })
          }
        >
          <option value="">Any popularity</option>
          <option value="200">Reasonably known</option>
          <option value="2000">Widely seen</option>
        </select>
      </div>

      {run.error && !isStale && <ErrorNotice>{run.error}</ErrorNotice>}
      {loading && items.length === 0 && (
        <Spinner label="Profiling your library and searching TMDB…" />
      )}

      {profile && filters.source === "reel" && <ProfilePanel profile={profile} />}

      {filters.source === "tmdb" && items.length > 0 && (
        <div className="card mb-7 p-4 text-xs leading-relaxed text-ink-400">
          <p>
            These come straight from TMDB&rsquo;s <code className="text-ink-300">/recommendations</code>{" "}
            feed for the {profile?.anchors.length ?? 0} titles you rated highest, merged and left in
            TMDB&rsquo;s own order. Titles surfaced by several of your entries rank first.
          </p>
          <p className="mt-2">
            The badge shows TMDB&rsquo;s user rating, not a taste match &mdash; nothing here is
            scored against your profile. Switch back to{" "}
            <strong className="text-ink-200">{SOURCE_LABELS.reel}</strong> to compare.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <TitleGrid>
            {items.map((item, index) => (
              <TitleCard
                key={item.key}
                tmdbId={item.tmdbId}
                mediaType={item.mediaType}
                title={item.title}
                posterPath={item.posterPath}
                year={item.year}
                priority={index < 6}
                overlay={<ScoreBadge score={item.score} source={filters.source} />}
                footer={
                  <ul className="space-y-0.5">
                    {item.reasons.slice(0, 2).map((reason) => (
                      <li
                        key={reason.text}
                        className="line-clamp-2 text-[0.7rem] leading-snug text-ink-400"
                      >
                        {reason.text}
                      </li>
                    ))}
                  </ul>
                }
              />
            ))}
          </TitleGrid>

          <div ref={sentinelRef} className="mt-8 flex flex-col items-center gap-3">
            {loading && <Spinner label="Ranking more candidates…" />}

            {canLoadMore && !loading && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setWantPage((page) => page + 1)}
              >
                Load more
              </button>
            )}

            {!run.hasMore && !loading && !isStale && (
              <p className="text-xs text-ink-400">
                That is everything worth ranking from {run.poolSize} candidates. Track and rate a
                few more titles to widen the search.
              </p>
            )}

            <p className="text-[0.7rem] text-ink-400">
              {filters.source === "tmdb"
                ? `Showing ${items.length} of ${run.poolSize} titles from TMDB's recommendation feed.`
                : `Showing ${items.length} of ${run.poolSize} candidates gathered from your library's neighbours, your top genres and themes, and this week's trending titles.`}
            </p>
          </div>
        </>
      )}

      {!loading && items.length === 0 && !run.error && (
        <EmptyState title="No matches with those filters">
          Loosen the era or popularity filter and try again.
        </EmptyState>
      )}
    </div>
  );
}

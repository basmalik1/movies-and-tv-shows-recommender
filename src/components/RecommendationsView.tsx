"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import type { RecommendationResult } from "@/lib/recommend/engine";

import { SparkIcon } from "./icons";
import { TitleCard, TitleGrid } from "./TitleCard";
import { EmptyState, ErrorNotice, PageHeader, Spinner } from "./ui";

type MediaFilter = "all" | "movie" | "tv";

interface Filters {
  mediaType: MediaFilter;
  minYear?: number;
  minVotes?: number;
}

/** Enough signal for the profile to mean something rather than echo one title. */
const MIN_USEFUL_LIBRARY = 3;

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
      : score >= 55
        ? "border-accent-500/40 bg-accent-600/20 text-accent-300"
        : "border-ink-600 bg-ink-950/80 text-ink-300";

  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[0.7rem] font-bold tabular-nums backdrop-blur ${tone}`}
      title="How closely this matches your taste profile"
    >
      {score}
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
  const [filters, setFilters] = useState<Filters>({ mediaType: "all" });
  /** Bumped by Regenerate to re-run the pipeline with unchanged filters. */
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<{
    key: string;
    result: RecommendationResult | null;
    error: string | null;
  } | null>(null);

  /**
   * The library is read at request time rather than tracked as a dependency:
   * rating one title should not silently re-run a forty-request pipeline.
   */
  const titlesRef = useRef(titles);
  useEffect(() => {
    titlesRef.current = titles;
  }, [titles]);

  const enabled = ready && titles.length >= MIN_USEFUL_LIBRARY;
  const requestKey = useMemo(() => JSON.stringify({ filters, nonce }), [filters, nonce]);

  // Loading is derived from "the settled result is not for the current request"
  // so the effect below never sets state synchronously.
  const loading = enabled && settled?.key !== requestKey;
  const result = settled?.result ?? null;
  const error = settled?.key === requestKey ? settled.error : null;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            library: titlesRef.current,
            filters: { ...filters, limit: 24 },
          }),
        });

        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not build recommendations.");
        setSettled({ key: requestKey, result: body as RecommendationResult, error: null });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setSettled({
          key: requestKey,
          result: null,
          error: caught instanceof Error ? caught.message : "Something went wrong.",
        });
      }
    })();

    return () => controller.abort();
  }, [enabled, requestKey, filters]);

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
        description="Ranked against your own taste profile, with the reasoning shown for every pick."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => setNonce((value) => value + 1)}
          >
            <SparkIcon width={15} height={15} />
            {loading ? "Thinking…" : "Regenerate"}
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["all", "movie", "tv"] as MediaFilter[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilters((current) => ({ ...current, mediaType: option }))}
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
            setFilters((current) => ({
              ...current,
              minYear: event.target.value ? Number(event.target.value) : undefined,
            }))
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
            setFilters((current) => ({
              ...current,
              minVotes: event.target.value ? Number(event.target.value) : undefined,
            }))
          }
        >
          <option value="">Any popularity</option>
          <option value="200">Reasonably known</option>
          <option value="2000">Widely seen</option>
        </select>
      </div>

      {error && <ErrorNotice>{error}</ErrorNotice>}
      {loading && !result && <Spinner label="Profiling your library and searching TMDB…" />}

      {result && (
        <>
          <ProfilePanel profile={result.profile} />

          {result.recommendations.length === 0 ? (
            <EmptyState title="No matches with those filters">
              Loosen the era or popularity filter and try again.
            </EmptyState>
          ) : (
            <>
              <TitleGrid>
                {result.recommendations.map((item, index) => (
                  <TitleCard
                    key={item.key}
                    tmdbId={item.tmdbId}
                    mediaType={item.mediaType}
                    title={item.title}
                    posterPath={item.posterPath}
                    year={item.year}
                    priority={index < 6}
                    overlay={<ScoreBadge score={item.score} />}
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

              <p className="mt-7 text-xs text-ink-400">
                Ranked {result.enrichedCount} of {result.poolSize} candidates gathered from your
                library&rsquo;s neighbours, your top genres and themes, and this week&rsquo;s
                trending titles.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

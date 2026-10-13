"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  addMonths,
  buildMonthGrid,
  isoDay,
  monthLabel,
  monthRange,
  weekdayLabels,
  type CalendarDay,
} from "@/lib/calendar";
import { useLibrary } from "@/lib/library/LibraryProvider";
import {
  expandableSeasons,
  movieEntriesInRange,
  formatDateHeading,
  type UpcomingEntry,
} from "@/lib/upcoming";

import { CheckForUpdates } from "./CheckForUpdates";
import { CalendarIcon, ChevronIcon } from "./icons";
import { EmptyState, ErrorNotice, PageHeader, Poster, Spinner } from "./ui";

type Scope = "watching" | "all";

const SCOPE_LABELS: Record<Scope, string> = {
  watching: "Shows I'm watching",
  all: "Everything tracked",
};

const KIND_DOT: Record<UpcomingEntry["kind"], string> = {
  episode: "bg-accent-500",
  "season-premiere": "bg-gold-400",
  "movie-release": "bg-emerald-400",
};

/** How many entries a cell shows before collapsing into a "+N" count. */
const MAX_PER_CELL = 3;

function EntryChip({ entry }: { entry: UpcomingEntry }) {
  return (
    <Link
      href={`/title/${entry.mediaType}/${entry.tmdbId}`}
      title={`${entry.title} — ${entry.headline}${entry.detail ? `: ${entry.detail}` : ""}`}
      className="flex items-center gap-1 rounded bg-ink-800/80 px-1 py-0.5 text-[0.65rem] leading-tight text-ink-200 transition-colors hover:bg-ink-700"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[entry.kind]}`} />
      <span className="truncate">{entry.title}</span>
    </Link>
  );
}

function DayCell({
  day,
  selected,
  onSelect,
}: {
  day: CalendarDay;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const hidden = day.entries.length - MAX_PER_CELL;

  return (
    <td
      className={`h-16 w-[14.28%] border border-ink-800 p-0 align-top sm:h-[104px] ${
        day.inMonth ? "" : "bg-ink-950/60"
      } ${selected ? "ring-1 ring-inset ring-accent-500" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSelect(day.date)}
        aria-current={day.isToday ? "date" : undefined}
        aria-label={`${formatDateHeading(day.date)}, ${day.entries.length} releases`}
        className="flex h-full w-full flex-col gap-1 p-1.5 text-left transition-colors hover:bg-ink-850/60"
      >
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold tabular-nums ${
            day.isToday
              ? "bg-accent-600 text-ink-950"
              : day.inMonth
                ? "text-ink-300"
                : "text-ink-600"
          }`}
        >
          {day.dayOfMonth}
        </span>

        <span className="hidden min-h-0 flex-1 flex-col gap-0.5 overflow-hidden sm:flex">
          {day.entries.slice(0, MAX_PER_CELL).map((entry) => (
            <EntryChip key={entry.id} entry={entry} />
          ))}
          {hidden > 0 && (
            <span className="pl-1 text-[0.65rem] text-ink-400">+{hidden} more</span>
          )}
        </span>

        {/* Phones cannot fit seven columns of titles, so show density and let
            the tap target open the day below. */}
        <span className="flex flex-wrap content-start gap-0.5 sm:hidden">
          {day.entries.slice(0, 6).map((entry) => (
            <span
              key={entry.id}
              className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[entry.kind]}`}
            />
          ))}
        </span>
      </button>
    </td>
  );
}

export function CalendarView() {
  const { titles, ready } = useLibrary();

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() };
  });
  const [scope, setScope] = useState<Scope>("watching");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const range = useMemo(
    () => monthRange(cursor.year, cursor.monthIndex),
    [cursor],
  );

  const scoped = useMemo(
    () =>
      titles.filter((title) =>
        scope === "all" ? title.status !== "dropped" : title.status === "watching",
      ),
    [titles, scope],
  );

  /** Only shows with a season worth expanding cost a request. */
  const shows = useMemo(
    () =>
      scoped
        .map((title) => ({ title, seasonNumbers: expandableSeasons(title, range) }))
        .filter((entry) => entry.seasonNumbers.length > 0)
        .map(({ title, seasonNumbers }) => ({
          tmdbId: title.tmdbId,
          title: title.title,
          posterPath: title.posterPath,
          seasonNumbers,
        })),
    [scoped, range],
  );

  const movieEntries = useMemo(() => movieEntriesInRange(scoped, range), [scoped, range]);

  const requestKey = useMemo(() => JSON.stringify({ range, shows }), [range, shows]);
  const [settled, setSettled] = useState<{
    key: string;
    entries: UpcomingEntry[];
    error: string | null;
  } | null>(null);

  // Derived rather than stored, so the effect never sets state synchronously.
  const matched = settled?.key === requestKey ? settled : null;
  const loading = ready && shows.length > 0 && matched === null;

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ready || shows.length === 0 || settled?.key === requestKey) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const response = await fetch("/api/schedule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ from: range.from, to: range.to, shows }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load the schedule.");
        setSettled({ key: requestKey, entries: body.entries ?? [], error: null });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setSettled({
          key: requestKey,
          entries: [],
          error: caught instanceof Error ? caught.message : "Could not load the schedule.",
        });
      }
    })();

    return () => controller.abort();
  }, [ready, requestKey, range, shows, settled?.key]);

  const entries = useMemo(
    () => [...(matched?.entries ?? []), ...movieEntries],
    [matched, movieEntries],
  );

  const grid = useMemo(
    () =>
      buildMonthGrid({
        year: cursor.year,
        monthIndex: cursor.monthIndex,
        entries,
      }),
    [cursor, entries],
  );

  const today = isoDay(new Date());
  const selectedDay = selectedDate
    ? (grid.weeks.flat().find((day) => day.date === selectedDate) ?? null)
    : null;

  function step(delta: number) {
    setCursor((current) => addMonths(current.year, current.monthIndex, delta));
    setSelectedDate(null);
  }

  function goToday() {
    const now = new Date();
    setCursor({ year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() });
    setSelectedDate(today);
  }

  if (!ready) {
    return (
      <div>
        <PageHeader title="Calendar" />
        <Spinner label="Reading your library…" />
      </div>
    );
  }

  const watchingCount = titles.filter((title) => title.status === "watching").length;

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Every announced episode for the shows you are in the middle of, laid out by air date."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(SCOPE_LABELS) as Scope[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={scope === option}
                onClick={() => setScope(option)}
                className={`btn ${scope === option ? "btn-primary" : "btn-ghost"}`}
              >
                {SCOPE_LABELS[option]}
              </button>
            ))}
          </div>
        }
      />

      <CheckForUpdates className="mb-5" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-ghost px-2"
            aria-label="Previous month"
            onClick={() => step(-1)}
          >
            <ChevronIcon width={16} height={16} className="rotate-180" />
          </button>
          <h2 className="min-w-[10.5rem] text-center text-base font-semibold tracking-tight">
            {monthLabel(cursor.year, cursor.monthIndex)}
          </h2>
          <button
            type="button"
            className="btn btn-ghost px-2"
            aria-label="Next month"
            onClick={() => step(1)}
          >
            <ChevronIcon width={16} height={16} />
          </button>
          <button type="button" className="btn btn-ghost ml-1" onClick={goToday}>
            Today
          </button>
        </div>

        <div className="flex items-center gap-3 text-[0.7rem] text-ink-400">
          {loading && <Spinner />}
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> Episode
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" /> Premiere
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Film
          </span>
        </div>
      </div>

      {matched?.error && (
        <div className="mb-4">
          <ErrorNotice>{matched.error}</ErrorNotice>
        </div>
      )}

      {scope === "watching" && watchingCount === 0 ? (
        <EmptyState title="You are not part-way through anything">
          Mark a series as <strong className="text-ink-200">Watching</strong> and its episode
          schedule appears here. Or switch to{" "}
          <button
            type="button"
            className="text-accent-400 underline underline-offset-2"
            onClick={() => setScope("all")}
          >
            Everything tracked
          </button>{" "}
          to include your watchlist.{" "}
          <Link href="/library" className="text-accent-400 underline underline-offset-2">
            Open your library
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse sm:min-w-[760px]">
              <thead>
                <tr>
                  {weekdayLabels().map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="border border-ink-800 bg-ink-900/60 px-2 py-1.5 text-[0.7rem] font-semibold uppercase tracking-widest text-ink-400"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.weeks.map((week) => (
                  <tr key={week[0].date}>
                    {week.map((day) => (
                      <DayCell
                        key={day.date}
                        day={day}
                        selected={day.date === selectedDate}
                        onSelect={setSelectedDate}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
            <section>
              <h3 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-ink-300">
                {monthLabel(cursor.year, cursor.monthIndex)} in full
              </h3>
              {grid.entriesInMonth.length === 0 ? (
                <p className="text-sm text-ink-400">
                  {loading
                    ? "Loading air dates…"
                    : "Nothing announced for this month. Try the next one, or refresh air dates from Settings."}
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {grid.entriesInMonth.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={`/title/${entry.mediaType}/${entry.tmdbId}`}
                        className="card flex items-center gap-3 p-2 transition-colors hover:border-ink-600"
                      >
                        <span className="w-10 shrink-0 text-center text-[0.7rem] font-semibold tabular-nums text-ink-400">
                          {entry.date.slice(8)}
                        </span>
                        <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-ink-800">
                          <Poster path={entry.posterPath} alt={entry.title} sizes="32px" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink-100">{entry.title}</span>
                          <span className="block truncate text-xs text-ink-400">
                            {entry.headline}
                            {entry.detail ? ` · ${entry.detail}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {selectedDay && (
              <aside className="order-first lg:order-none">
                <h3 className="mb-2.5 text-sm font-semibold uppercase tracking-widest text-ink-300">
                  {formatDateHeading(selectedDay.date)}
                </h3>
                {selectedDay.entries.length === 0 ? (
                  <p className="text-sm text-ink-400">Nothing airing.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDay.entries.map((entry) => (
                      <li key={entry.id} className="card p-3">
                        <Link
                          href={`/title/${entry.mediaType}/${entry.tmdbId}`}
                          className="text-sm font-medium text-ink-100 hover:text-accent-400"
                        >
                          {entry.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-400">
                          {entry.headline}
                          {entry.detail ? ` · ${entry.detail}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            )}
          </div>

          {shows.length === 0 && !loading && grid.entriesInMonth.length === 0 && (
            <p className="mt-5 flex items-center gap-2 text-xs text-ink-400">
              <CalendarIcon width={14} height={14} />
              None of the {scope === "watching" ? "shows you are watching" : "titles you track"}{" "}
              have a season airing around this month.
            </p>
          )}
        </>
      )}
    </div>
  );
}

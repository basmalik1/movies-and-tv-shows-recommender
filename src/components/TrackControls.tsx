"use client";

import { useState, useTransition } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import { titleId, WATCH_STATUSES, STATUS_LABELS, type WatchStatus } from "@/lib/library/types";
import type { MediaType, TmdbTitleDetail } from "@/lib/tmdb/types";

import { StarIcon, TrashIcon } from "./icons";

export function RatingControl({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHover(null)}
        role="radiogroup"
        aria-label="Your rating out of 10"
      >
        {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => {
          const active = shown !== null && score <= shown;
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={value === score}
              aria-label={`Rate ${score} out of 10`}
              disabled={disabled}
              onMouseEnter={() => setHover(score)}
              onFocus={() => setHover(score)}
              onClick={() => onChange(value === score ? null : score)}
              className={`transition-colors ${
                active ? "text-gold-400" : "text-ink-600 hover:text-ink-400"
              } disabled:opacity-40`}
            >
              <StarIcon filled={active} width={17} height={17} />
            </button>
          );
        })}
      </div>
      <span className="ml-1 w-12 text-xs font-semibold tabular-nums text-ink-300">
        {shown ? `${shown}/10` : "Unrated"}
      </span>
    </div>
  );
}

export function TrackControls({ detail }: { detail: TmdbTitleDetail }) {
  const library = useLibrary();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const mediaType: MediaType = "name" in detail && !("title" in detail) ? "tv" : "movie";
  const id = titleId(mediaType, detail.id);
  const tracked = library.byId.get(id);

  async function choose(status: WatchStatus) {
    setBusy(true);
    try {
      if (tracked && tracked.status === status) {
        await library.untrack(id);
      } else if (tracked) {
        await library.setStatus(id, status);
      } else {
        await library.track(detail, status);
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending || !library.ready;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {WATCH_STATUSES.map((status) => {
          const active = tracked?.status === status;
          return (
            <button
              key={status}
              type="button"
              disabled={disabled}
              onClick={() => choose(status)}
              aria-pressed={active}
              className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
              title={active ? "Click again to remove from your library" : undefined}
            >
              {STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>

      {tracked && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RatingControl
            value={tracked.rating}
            disabled={disabled}
            onChange={(rating) =>
              startTransition(() => {
                void library.setRating(id, rating);
              })
            }
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => void library.untrack(id)}
            className="btn btn-ghost text-ink-400 hover:text-rose-300"
          >
            <TrashIcon width={15} height={15} />
            Remove
          </button>
        </div>
      )}

      {tracked && (
        <p className="text-xs text-ink-400">
          Ratings drive your recommendations. Anything above 6.5 counts as a positive signal.
        </p>
      )}
    </div>
  );
}

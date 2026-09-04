"use client";

import Link from "next/link";
import { useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import type { MediaType } from "@/lib/tmdb/types";

import { CheckIcon, PlusIcon } from "./icons";
import { Poster, StatusBadge } from "./ui";

export interface TitleCardProps {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  year: number | null;
  /** Rendered over the top-right of the poster, e.g. a match score. */
  overlay?: React.ReactNode;
  /** Rendered under the title, e.g. progress or an air date. */
  footer?: React.ReactNode;
  priority?: boolean;
}

export function TitleCard({
  tmdbId,
  mediaType,
  title,
  posterPath,
  year,
  overlay,
  footer,
  priority,
}: TitleCardProps) {
  const { get, trackById } = useLibrary();
  const [pending, setPending] = useState(false);
  const tracked = get(mediaType, tmdbId);

  async function quickAdd(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (tracked || pending) return;
    setPending(true);
    try {
      await trackById(mediaType, tmdbId, "watchlist");
    } catch (error) {
      console.error("Could not add to watchlist", error);
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="group relative">
      <Link href={`/title/${mediaType}/${tmdbId}`} className="block">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-ink-800 bg-ink-850">
          <Poster path={posterPath} alt={title} priority={priority} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          {overlay && <div className="absolute left-2 top-2">{overlay}</div>}

          <button
            type="button"
            onClick={quickAdd}
            disabled={pending || Boolean(tracked)}
            aria-label={tracked ? `${title} is in your library` : `Add ${title} to watchlist`}
            className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border backdrop-blur transition ${
              tracked
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                : "border-ink-600 bg-ink-950/70 text-ink-200 opacity-0 hover:bg-accent-600 hover:text-ink-950 group-hover:opacity-100 focus-visible:opacity-100"
            } ${pending ? "animate-pulse" : ""}`}
          >
            {tracked ? <CheckIcon width={15} height={15} /> : <PlusIcon width={15} height={15} />}
          </button>
        </div>

        <div className="mt-2">
          <h3 className="line-clamp-2 text-[0.82rem] font-medium leading-snug text-ink-100">
            {title}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-ink-400">
            <span className="uppercase tracking-wide">{mediaType === "tv" ? "Series" : "Film"}</span>
            {year && <span>· {year}</span>}
          </p>
        </div>
      </Link>

      {tracked && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <StatusBadge status={tracked.status} />
          {tracked.rating !== null && (
            <span className="text-[0.7rem] font-semibold text-gold-400">
              {tracked.rating}/10
            </span>
          )}
        </div>
      )}

      {footer && <div className="mt-1.5">{footer}</div>}
    </article>
  );
}

export function TitleGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
    </div>
  );
}

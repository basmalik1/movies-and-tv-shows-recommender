"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { fetchTitleDetail } from "@/lib/tmdb/client";
import type { MediaType, TmdbTitleDetail } from "@/lib/tmdb/types";

import { trackedTitleFromDetail } from "./factory";
import { createLibraryRepository } from "./indexeddb";
import {
  episodeKey,
  titleId,
  type EpisodeKey,
  type LibraryExport,
  type LibraryRepository,
  type TrackedTitle,
  type WatchStatus,
} from "./types";

interface LibraryContextValue {
  /** False until IndexedDB has been read; guards against rendering an empty library. */
  ready: boolean;
  titles: TrackedTitle[];
  byId: Map<string, TrackedTitle>;
  get(mediaType: MediaType, tmdbId: number): TrackedTitle | undefined;
  isTracked(mediaType: MediaType, tmdbId: number): boolean;

  track(detail: TmdbTitleDetail, status?: WatchStatus): Promise<TrackedTitle>;
  trackById(mediaType: MediaType, tmdbId: number, status?: WatchStatus): Promise<TrackedTitle>;
  setStatus(id: string, status: WatchStatus): Promise<void>;
  setRating(id: string, rating: number | null): Promise<void>;
  setNotes(id: string, notes: string): Promise<void>;
  untrack(id: string): Promise<void>;

  toggleEpisode(id: string, season: number, episode: number): Promise<void>;
  setEpisodes(id: string, keys: EpisodeKey[], watched: boolean): Promise<void>;
  markWatchedThrough(id: string, season: number, episode: number): Promise<void>;

  /** Re-fetch TMDB metadata (new seasons, air dates) while keeping user data. */
  refresh(id: string): Promise<void>;
  refreshAll(): Promise<number>;

  exportLibrary(): LibraryExport;
  importLibrary(data: unknown, mode: "merge" | "replace"): Promise<number>;
  clearLibrary(): Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const repositoryRef = useRef<LibraryRepository | null>(null);
  const [titles, setTitles] = useState<TrackedTitle[]>([]);
  const [ready, setReady] = useState(false);

  /**
   * Created lazily on first use rather than during render: the server has no
   * IndexedDB, and touching a ref while rendering is not safe under React 19.
   */
  const repository = useCallback(() => {
    if (!repositoryRef.current) repositoryRef.current = createLibraryRepository();
    return repositoryRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;

    repository()
      .list()
      .then((stored) => {
        if (!cancelled) setTitles(stored);
      })
      .catch((error) => {
        console.error("Could not read the local library", error);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  const byId = useMemo(
    () => new Map(titles.map((title) => [title.id, title] as const)),
    [titles],
  );

  /** Single write path: persist first, then mirror into React state. */
  const persist = useCallback(async (next: TrackedTitle) => {
    await repository().put(next);
    setTitles((current) => {
      const index = current.findIndex((title) => title.id === next.id);
      if (index === -1) return [...current, next];
      const copy = [...current];
      copy[index] = next;
      return copy;
    });
  }, [repository]);

  const update = useCallback(
    async (id: string, mutate: (title: TrackedTitle) => TrackedTitle) => {
      const current = byId.get(id);
      if (!current) return;
      await persist({ ...mutate(current), updatedAt: Date.now() });
    },
    [byId, persist],
  );

  const track = useCallback(
    async (detail: TmdbTitleDetail, status: WatchStatus = "watchlist") => {
      const mediaType: MediaType = "name" in detail && !("title" in detail) ? "tv" : "movie";
      const existing = byId.get(titleId(mediaType, detail.id));
      const next = trackedTitleFromDetail(detail, { status, existing });
      await persist(next);
      return next;
    },
    [byId, persist],
  );

  const trackById = useCallback(
    async (mediaType: MediaType, tmdbId: number, status: WatchStatus = "watchlist") => {
      const detail = await fetchTitleDetail(mediaType, tmdbId);
      return track(detail, status);
    },
    [track],
  );

  const setStatus = useCallback(
    (id: string, status: WatchStatus) =>
      update(id, (title) => ({
        ...title,
        status,
        completedAt:
          status === "completed" ? (title.completedAt ?? Date.now()) : title.completedAt,
      })),
    [update],
  );

  const setRating = useCallback(
    (id: string, rating: number | null) => update(id, (title) => ({ ...title, rating })),
    [update],
  );

  const setNotes = useCallback(
    (id: string, notes: string) => update(id, (title) => ({ ...title, notes })),
    [update],
  );

  const untrack = useCallback(async (id: string) => {
    await repository().remove(id);
    setTitles((current) => current.filter((title) => title.id !== id));
  }, [repository]);

  /** Ticking an episode implies you have started the show. */
  function withEpisodes(title: TrackedTitle, watched: EpisodeKey[]): TrackedTitle {
    const startedWatching = watched.length > 0 && title.status === "watchlist";
    return {
      ...title,
      watchedEpisodes: watched,
      lastWatchedAt: watched.length > 0 ? Date.now() : title.lastWatchedAt,
      status: startedWatching ? "watching" : title.status,
    };
  }

  const toggleEpisode = useCallback(
    (id: string, season: number, episode: number) =>
      update(id, (title) => {
        const key = episodeKey(season, episode);
        const has = title.watchedEpisodes.includes(key);
        const watched = has
          ? title.watchedEpisodes.filter((entry) => entry !== key)
          : [...title.watchedEpisodes, key];
        return withEpisodes(title, watched);
      }),
    [update],
  );

  const setEpisodes = useCallback(
    (id: string, keys: EpisodeKey[], watched: boolean) =>
      update(id, (title) => {
        const set = new Set(title.watchedEpisodes);
        for (const key of keys) {
          if (watched) set.add(key);
          else set.delete(key);
        }
        return withEpisodes(title, [...set]);
      }),
    [update],
  );

  /** "I am up to here" — ticks everything in broadcast order up to the given episode. */
  const markWatchedThrough = useCallback(
    (id: string, season: number, episode: number) =>
      update(id, (title) => {
        const set = new Set(title.watchedEpisodes);
        for (const seasonInfo of title.seasons) {
          if (seasonInfo.seasonNumber === 0 || seasonInfo.seasonNumber > season) continue;
          const last =
            seasonInfo.seasonNumber === season ? episode : seasonInfo.episodeCount;
          for (let number = 1; number <= last; number += 1) {
            set.add(episodeKey(seasonInfo.seasonNumber, number));
          }
        }
        return withEpisodes(title, [...set]);
      }),
    [update],
  );

  const refresh = useCallback(
    async (id: string) => {
      const existing = byId.get(id);
      if (!existing) return;
      const detail = await fetchTitleDetail(existing.mediaType, existing.tmdbId);
      await persist(trackedTitleFromDetail(detail, { existing, status: existing.status }));
    },
    [byId, persist],
  );

  /**
   * Refreshes every tracked title, films included: as well as picking up new
   * air dates, this re-derives the stored feature ids, so improvements to
   * keyword filtering reach libraries that were built before them.
   *
   * Sequential on purpose — a background refresh must not hammer the proxy.
   */
  const refreshAll = useCallback(async () => {
    let updated = 0;
    for (const title of titles) {
      try {
        await refresh(title.id);
        updated += 1;
      } catch (error) {
        console.warn(`Could not refresh ${title.title}`, error);
      }
    }
    return updated;
  }, [refresh, titles]);

  const exportLibrary = useCallback(
    (): LibraryExport => ({
      version: 1,
      exportedAt: new Date().toISOString(),
      titles,
    }),
    [titles],
  );

  const importLibrary = useCallback(
    async (data: unknown, mode: "merge" | "replace") => {
      const payload = data as Partial<LibraryExport> | null;
      if (!payload || !Array.isArray(payload.titles)) {
        throw new Error("That file does not look like a library export.");
      }

      const incoming = payload.titles.filter(
        (title): title is TrackedTitle =>
          Boolean(title) && typeof title.id === "string" && typeof title.tmdbId === "number",
      );

      const store = repository();
      if (mode === "replace") {
        await store.clear();
        await store.putMany(incoming);
        setTitles(incoming);
      } else {
        const merged = new Map(titles.map((title) => [title.id, title] as const));
        for (const title of incoming) {
          const existing = merged.get(title.id);
          // Last write wins per title, so re-importing an older backup is safe.
          if (!existing || title.updatedAt >= existing.updatedAt) merged.set(title.id, title);
        }
        const next = [...merged.values()];
        await store.putMany(next);
        setTitles(next);
      }

      return incoming.length;
    },
    [repository, titles],
  );

  const clearLibrary = useCallback(async () => {
    await repository().clear();
    setTitles([]);
  }, [repository]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      ready,
      titles,
      byId,
      get: (mediaType, tmdbId) => byId.get(titleId(mediaType, tmdbId)),
      isTracked: (mediaType, tmdbId) => byId.has(titleId(mediaType, tmdbId)),
      track,
      trackById,
      setStatus,
      setRating,
      setNotes,
      untrack,
      toggleEpisode,
      setEpisodes,
      markWatchedThrough,
      refresh,
      refreshAll,
      exportLibrary,
      importLibrary,
      clearLibrary,
    }),
    [
      ready,
      titles,
      byId,
      track,
      trackById,
      setStatus,
      setRating,
      setNotes,
      untrack,
      toggleEpisode,
      setEpisodes,
      markWatchedThrough,
      refresh,
      refreshAll,
      exportLibrary,
      importLibrary,
      clearLibrary,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used inside <LibraryProvider>");
  return context;
}

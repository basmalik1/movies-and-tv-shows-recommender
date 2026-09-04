import type { MediaType } from "@/lib/tmdb/types";
import type { TrackedTitle, WatchStatus } from "@/lib/library/types";

import { addTo, l2Normalize, topEntries, type SparseVector } from "./vector";

/**
 * How much a title in each state is allowed to influence the profile. Finishing
 * something is a much louder signal than adding it to a watchlist.
 */
const STATUS_WEIGHT: Record<WatchStatus, number> = {
  completed: 1,
  watching: 0.9,
  watchlist: 0.35,
  dropped: 0.7,
};

/** Used when the user tracked a title but never rated it. */
const IMPLICIT_SENTIMENT: Record<WatchStatus, number> = {
  completed: 0.6,
  watching: 0.55,
  watchlist: 0.3,
  dropped: -0.7,
};

/** A rating of 6.5 is the neutral point; 10 is a full endorsement, 3 a full rejection. */
const NEUTRAL_RATING = 6.5;
const RATING_SPAN = 3.5;

/** Tastes drift. An 18-month half-life keeps old favourites relevant but not dominant. */
const RECENCY_HALF_LIFE_DAYS = 540;
const MIN_RECENCY = 0.55;

/** Features backed by a single title are shrunk toward zero to resist noise. */
const SUPPORT_PRIOR = 1.5;

export interface ProfileAnchor {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  rating: number | null;
  /** Signed influence: positive for titles the user liked, negative for rejects. */
  signal: number;
  genreIds: number[];
  keywordIds: number[];
  peopleIds: number[];
}

export interface TasteProfile {
  genres: SparseVector;
  keywords: SparseVector;
  people: SparseVector;
  keywordNames: Record<number, string>;
  peopleNames: Record<number, string>;
  /** Liked titles, strongest first. Seeds candidate generation and explanations. */
  anchors: ProfileAnchor[];
  /** Titles the user disliked or dropped; their features are penalised. */
  detractors: ProfileAnchor[];
  /** Library ids already tracked — never recommend these back. */
  excludeIds: string[];
  mediaMix: Record<MediaType, number>;
  /** Average release year of liked titles, used for a mild era affinity bonus. */
  eraCenter: number | null;
  languageMix: Record<string, number>;
  ratedCount: number;
  sampleSize: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sentimentOf(title: TrackedTitle): number {
  if (title.rating !== null) {
    return clamp((title.rating - NEUTRAL_RATING) / RATING_SPAN, -1, 1);
  }
  return IMPLICIT_SENTIMENT[title.status];
}

function recencyOf(title: TrackedTitle, now: number): number {
  const touchedAt = title.lastWatchedAt ?? title.completedAt ?? title.updatedAt ?? title.addedAt;
  const ageDays = Math.max(0, (now - touchedAt) / 86_400_000);
  const decay = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return MIN_RECENCY + (1 - MIN_RECENCY) * decay;
}

/** Signed strength of a single library entry's opinion. */
export function signalOf(title: TrackedTitle, now = Date.now()): number {
  return STATUS_WEIGHT[title.status] * sentimentOf(title) * recencyOf(title, now);
}

/**
 * Spreading a title's signal across its features by 1/sqrt(count) stops a title
 * tagged with 40 keywords from drowning out one tagged with 4.
 */
function spread(
  vector: SparseVector,
  support: Map<number, number>,
  ids: number[],
  signal: number,
): void {
  if (ids.length === 0) return;
  const share = signal / Math.sqrt(ids.length);
  for (const id of ids) {
    addTo(vector, id, share);
    support.set(id, (support.get(id) ?? 0) + 1);
  }
}

/** Shrink features that only one or two titles vouch for, then unit-normalize. */
function finalize(vector: SparseVector, support: Map<number, number>): SparseVector {
  const shrunk: SparseVector = {};
  for (const [key, value] of Object.entries(vector)) {
    const id = Number(key);
    const n = support.get(id) ?? 1;
    const weight = n / (n + SUPPORT_PRIOR);
    const adjusted = value * weight;
    if (Math.abs(adjusted) > 1e-6) shrunk[id] = adjusted;
  }
  return l2Normalize(shrunk);
}

function toAnchor(title: TrackedTitle, signal: number): ProfileAnchor {
  return {
    id: title.id,
    tmdbId: title.tmdbId,
    mediaType: title.mediaType,
    title: title.title,
    posterPath: title.posterPath,
    rating: title.rating,
    signal,
    genreIds: title.genreIds,
    keywordIds: title.keywordIds,
    peopleIds: title.peopleIds,
  };
}

/**
 * Turn a library into a weighted feature profile.
 *
 * Everything downstream — candidate generation, scoring, explanations — reads
 * only this object, which keeps the engine testable with plain fixtures.
 */
export function buildTasteProfile(
  library: TrackedTitle[],
  now = Date.now(),
): TasteProfile {
  const genres: SparseVector = {};
  const keywords: SparseVector = {};
  const people: SparseVector = {};

  const genreSupport = new Map<number, number>();
  const keywordSupport = new Map<number, number>();
  const peopleSupport = new Map<number, number>();

  const keywordNames: Record<number, string> = {};
  const peopleNames: Record<number, string> = {};

  const anchors: ProfileAnchor[] = [];
  const detractors: ProfileAnchor[] = [];
  const mediaMix: Record<MediaType, number> = { movie: 0, tv: 0 };
  const languageMix: Record<string, number> = {};

  let eraWeightedSum = 0;
  let eraWeight = 0;
  let ratedCount = 0;

  for (const title of library) {
    const signal = signalOf(title, now);
    if (title.rating !== null) ratedCount += 1;

    spread(genres, genreSupport, title.genreIds, signal);
    spread(keywords, keywordSupport, title.keywordIds, signal);
    spread(people, peopleSupport, title.peopleIds, signal);

    Object.assign(keywordNames, title.keywordNames);
    Object.assign(peopleNames, title.peopleNames);

    const anchor = toAnchor(title, signal);
    if (signal > 0) {
      anchors.push(anchor);
      mediaMix[title.mediaType] += signal;
      languageMix[title.originalLanguage] =
        (languageMix[title.originalLanguage] ?? 0) + signal;
      if (title.year) {
        eraWeightedSum += title.year * signal;
        eraWeight += signal;
      }
    } else if (signal < 0) {
      detractors.push(anchor);
    }
  }

  anchors.sort((a, b) => b.signal - a.signal);
  detractors.sort((a, b) => a.signal - b.signal);

  return {
    genres: finalize(genres, genreSupport),
    keywords: finalize(keywords, keywordSupport),
    people: finalize(people, peopleSupport),
    keywordNames,
    peopleNames,
    anchors,
    detractors,
    excludeIds: library.map((title) => title.id),
    mediaMix,
    eraCenter: eraWeight > 0 ? eraWeightedSum / eraWeight : null,
    languageMix,
    ratedCount,
    sampleSize: library.length,
  };
}

/** Human-readable summary of what the profile learned, shown in the UI. */
export function describeProfile(profile: TasteProfile, genreNames: Record<number, string>) {
  return {
    topGenres: topEntries(profile.genres, 6).map((entry) => ({
      id: entry.id,
      name: genreNames[entry.id] ?? `Genre ${entry.id}`,
      weight: entry.value,
    })),
    topKeywords: topEntries(profile.keywords, 10).map((entry) => ({
      id: entry.id,
      name: profile.keywordNames[entry.id] ?? `#${entry.id}`,
      weight: entry.value,
    })),
    topPeople: topEntries(profile.people, 8).map((entry) => ({
      id: entry.id,
      name: profile.peopleNames[entry.id] ?? `#${entry.id}`,
      weight: entry.value,
    })),
  };
}

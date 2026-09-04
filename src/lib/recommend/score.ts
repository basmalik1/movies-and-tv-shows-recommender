import type { NormalizedTitle } from "@/lib/tmdb/types";

import type { Candidate } from "./candidates";
import type { TasteProfile } from "./profile";
import { applyIdf, contributions, cosineWithSet, type SparseVector } from "./vector";

/** Feature ids resolved for a candidate after its detail payload is fetched. */
export interface CandidateFeatures {
  keywordIds: number[];
  keywordNames: Record<number, string>;
  peopleIds: number[];
  peopleNames: Record<number, string>;
  runtime: number | null;
}

export type ReasonKind = "anchor" | "keyword" | "person" | "genre" | "quality" | "trending";

export interface RecommendationReason {
  kind: ReasonKind;
  text: string;
}

export interface ScoreBreakdown {
  keywords: number;
  people: number;
  genres: number;
  neighbours: number;
  quality: number;
  novelty: number;
  era: number;
  language: number;
}

/** IDF tables computed over the live candidate pool, not baked in. */
export interface IdfTables {
  genres: SparseVector;
  keywords: SparseVector;
}

export interface ScoredCandidate extends NormalizedTitle {
  key: string;
  /** 0-100, for display. */
  score: number;
  breakdown: ScoreBreakdown;
  reasons: RecommendationReason[];
  matchedKeywords: string[];
  matchedPeople: string[];
  matchedGenres: string[];
  /** Library titles that led here, strongest first. */
  via: { title: string; rating: number | null }[];
}

/**
 * Tuned against real libraries. Two deliberate choices:
 *
 * - Thematic overlap outranks everything, because it is the only component
 *   that reflects why someone liked a title rather than that it was popular.
 * - Neighbour agreement is held down: TMDB's own /recommendations skew hard
 *   toward whatever is widely watched, so leaning on it surfaces the same
 *   handful of blockbuster dramas for everyone.
 */
const WEIGHTS: ScoreBreakdown = {
  keywords: 0.34,
  people: 0.14,
  genres: 0.12,
  neighbours: 0.18,
  quality: 0.1,
  novelty: 0.07,
  era: 0.03,
  language: 0.02,
};

/**
 * Bayesian average: pulls low-vote titles toward the global mean so a 10.0
 * backed by three votes cannot outrank a 8.4 backed by twenty thousand.
 */
const PRIOR_VOTES = 500;
const PRIOR_MEAN = 6.5;

/** Tuned so a strong thematic match lands in the 70s-80s rather than the 60s. */
const DISPLAY_SCALE = 175;

function qualityPrior(title: NormalizedTitle): number {
  const votes = title.voteCount;
  const bayes =
    (votes / (votes + PRIOR_VOTES)) * title.voteAverage +
    (PRIOR_VOTES / (votes + PRIOR_VOTES)) * PRIOR_MEAN;
  return Math.min(1, Math.max(0, (bayes - 5) / 3.5));
}

/**
 * Agreement across independent sources matters more than any single one, but
 * with diminishing returns so a title cannot win on volume of mentions alone.
 */
function neighbourScore(candidate: Candidate): number {
  const total = candidate.sources.reduce((sum, source) => sum + Math.max(0, source.weight), 0);
  return 1 - Math.exp(-total);
}

/**
 * Mild preference for titles the user is less likely to have already been
 * pushed at from every direction. Deliberately gentle: crank this up and the
 * list fills with obscure things nobody wants.
 */
function novelty(title: NormalizedTitle): number {
  const reach = Math.log10(Math.max(1, title.voteCount));
  // ~0 votes -> 1.0, 1k votes -> 0.7, 100k votes -> 0.17
  return Math.min(1, Math.max(0, 1 - (reach - 1) / 3.5));
}

function eraAffinity(title: NormalizedTitle, profile: TasteProfile): number {
  if (!profile.eraCenter || !title.year) return 0.5;
  return Math.exp(-Math.abs(title.year - profile.eraCenter) / 25);
}

function languageAffinity(title: NormalizedTitle, profile: TasteProfile): number {
  const total = Object.values(profile.languageMix).reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0.5;
  return (profile.languageMix[title.originalLanguage] ?? 0) / total;
}

/** Cheap first pass over the whole pool, before spending requests on detail fetches. */
export function prescore(
  candidate: Candidate,
  profile: TasteProfile,
  genreIdf: SparseVector = {},
): number {
  const genres = applyIdf(profile.genres, genreIdf);
  return (
    0.5 * neighbourScore(candidate) +
    0.35 * Math.max(0, cosineWithSet(genres, candidate.genreIds)) +
    0.15 * qualityPrior(candidate)
  );
}

function buildReasons(
  candidate: Candidate,
  breakdown: ScoreBreakdown,
  matched: { keywords: string[]; people: string[]; genres: string[] },
  via: { title: string; rating: number | null }[],
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];

  const strongest = via[0];
  if (strongest) {
    reasons.push({
      kind: "anchor",
      text: strongest.rating
        ? `Sits next to ${strongest.title}, which you rated ${strongest.rating}/10`
        : `Sits next to ${strongest.title} from your library`,
    });
  }

  if (matched.keywords.length > 0) {
    reasons.push({
      kind: "keyword",
      text: `Shares themes you gravitate to: ${matched.keywords.slice(0, 3).join(", ")}`,
    });
  }

  if (matched.people.length > 0) {
    reasons.push({
      kind: "person",
      text: `Features ${matched.people.slice(0, 2).join(" and ")}, recurring in your favourites`,
    });
  }

  if (matched.genres.length > 0 && breakdown.genres > 0.2) {
    reasons.push({
      kind: "genre",
      text: `Squarely in your ${matched.genres.slice(0, 2).join(" / ")} wheelhouse`,
    });
  }

  if (reasons.length < 2 && breakdown.quality > 0.7) {
    reasons.push({
      kind: "quality",
      text: `Broadly acclaimed: ${candidate.voteAverage.toFixed(1)}/10 across ${candidate.voteCount.toLocaleString()} votes`,
    });
  }

  if (reasons.length === 0) {
    reasons.push({ kind: "trending", text: "Popular right now and new to your library" });
  }

  return reasons;
}

export function scoreCandidate(
  candidate: Candidate,
  features: CandidateFeatures,
  profile: TasteProfile,
  genreNames: Record<number, string>,
  idf: IdfTables = { genres: {}, keywords: {} },
): ScoredCandidate {
  // Rare, specific tags should count for more than ubiquitous ones.
  const keywordProfile = applyIdf(profile.keywords, idf.keywords);
  const genreProfile = applyIdf(profile.genres, idf.genres);

  const breakdown: ScoreBreakdown = {
    keywords: cosineWithSet(keywordProfile, features.keywordIds),
    people: cosineWithSet(profile.people, features.peopleIds),
    genres: cosineWithSet(genreProfile, candidate.genreIds),
    neighbours: neighbourScore(candidate),
    quality: qualityPrior(candidate),
    novelty: novelty(candidate),
    era: eraAffinity(candidate, profile),
    language: languageAffinity(candidate, profile),
  };

  const raw = (Object.keys(WEIGHTS) as (keyof ScoreBreakdown)[]).reduce(
    (sum, key) => sum + WEIGHTS[key] * breakdown[key],
    0,
  );

  const matchedKeywords = contributions(keywordProfile, features.keywordIds)
    .slice(0, 5)
    .map((entry) => profile.keywordNames[entry.id] ?? features.keywordNames[entry.id])
    .filter((name): name is string => Boolean(name));

  const matchedPeople = contributions(profile.people, features.peopleIds)
    .slice(0, 4)
    .map((entry) => profile.peopleNames[entry.id] ?? features.peopleNames[entry.id])
    .filter((name): name is string => Boolean(name));

  const matchedGenres = contributions(genreProfile, candidate.genreIds)
    .slice(0, 3)
    .map((entry) => genreNames[entry.id])
    .filter((name): name is string => Boolean(name));

  const via = candidate.sources
    .filter((source) => source.anchorTitle)
    .sort((a, b) => b.weight - a.weight)
    .map((source) => ({
      title: source.anchorTitle as string,
      rating: source.anchorRating ?? null,
    }))
    .filter((entry, index, all) => all.findIndex((other) => other.title === entry.title) === index)
    .slice(0, 3);

  return {
    ...candidate,
    key: candidate.key,
    // Blended cosines land in a narrow band, and IDF weighting narrows it
    // further, so stretch into a readable 0-100. This is a presentation scale,
    // not a probability: only the ordering is meaningful.
    score: Math.round(Math.min(100, Math.max(0, raw * DISPLAY_SCALE))),
    breakdown,
    reasons: buildReasons(
      candidate,
      breakdown,
      { keywords: matchedKeywords, people: matchedPeople, genres: matchedGenres },
      via,
    ),
    matchedKeywords,
    matchedPeople,
    matchedGenres,
    via,
  };
}

function jaccard(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const intersection = a.filter((id) => setB.has(id)).length;
  return intersection / (a.length + b.length - intersection);
}

/**
 * Maximal Marginal Relevance: repeatedly take the best remaining title after
 * penalising it for resembling what has already been picked, so the list is not
 * ten variations on the same franchise.
 */
export function diversify(
  scored: ScoredCandidate[],
  featuresByKey: Map<string, CandidateFeatures>,
  count: number,
  lambda = 0.35,
): ScoredCandidate[] {
  const remaining = [...scored].sort((a, b) => b.score - a.score);
  const picked: ScoredCandidate[] = [];

  const fingerprint = (candidate: ScoredCandidate) => [
    ...candidate.genreIds,
    ...(featuresByKey.get(candidate.key)?.keywordIds ?? []),
  ];

  while (picked.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const similarity = picked.reduce(
        (max, chosen) => Math.max(max, jaccard(fingerprint(candidate), fingerprint(chosen))),
        0,
      );
      const value = candidate.score / 100 - lambda * similarity;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }

    picked.push(remaining.splice(bestIndex, 1)[0]);
  }

  return picked;
}

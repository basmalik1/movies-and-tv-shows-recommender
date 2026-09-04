import type { NormalizedTitle } from "@/lib/tmdb/types";

import type { RecommendationItem } from "./score";

/**
 * Ranking and presentation for the TMDB passthrough. Kept free of IO — and so
 * of `server-only` — so the ordering rules can be tested directly.
 */

export interface TmdbCandidate extends NormalizedTitle {
  key: string;
  /** How many of your titles TMDB linked this to — its own co-watch agreement. */
  anchorCount: number;
  /** Best position TMDB gave it in any single list; 0 is the top of a page. */
  bestPosition: number;
  via: { title: string; rating: number | null }[];
}

/**
 * TMDB returns each feed already ranked, so respect that ordering: agreement
 * across several of your titles first, then TMDB's own placement, then reach.
 */
export function rankTmdbCandidates(candidates: TmdbCandidate[]): TmdbCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      b.anchorCount - a.anchorCount ||
      a.bestPosition - b.bestPosition ||
      b.popularity - a.popularity,
  );
}

export function toRecommendationItem(candidate: TmdbCandidate): RecommendationItem {
  const reasons: RecommendationItem["reasons"] = [];
  const strongest = candidate.via[0];

  if (candidate.anchorCount > 1) {
    reasons.push({
      kind: "anchor",
      text: `TMDB links this to ${candidate.anchorCount} titles in your library`,
    });
  } else if (strongest) {
    reasons.push({
      kind: "anchor",
      text: strongest.rating
        ? `TMDB lists this alongside ${strongest.title}, which you rated ${strongest.rating}/10`
        : `TMDB lists this alongside ${strongest.title}`,
    });
  }

  if (candidate.voteCount > 0) {
    reasons.push({
      kind: "quality",
      text: `Rated ${candidate.voteAverage.toFixed(1)}/10 by ${candidate.voteCount.toLocaleString()} TMDB users`,
    });
  }

  return {
    ...candidate,
    // No taste match is computed here, so showing one would be a lie. The badge
    // carries TMDB's own user rating instead, and the UI labels it as such.
    score: Math.round(candidate.voteAverage * 10),
    reasons,
    via: candidate.via,
  };
}

/**
 * Which engine produced a set of recommendations.
 *
 * - `reel`  — the taste-profile model in this directory.
 * - `tmdb`  — a straight passthrough of TMDB's own /recommendations feed,
 *             kept deliberately naive so the two can be compared honestly.
 *
 * Note there is no TheTVDB option: its v4 API is a metadata database and
 * exposes no recommendations, similar-titles, or related-content endpoint.
 */
export type RecommendationSource = "reel" | "tmdb";

export const RECOMMENDATION_SOURCES: RecommendationSource[] = ["reel", "tmdb"];

export const SOURCE_LABELS: Record<RecommendationSource, string> = {
  reel: "Your taste model",
  tmdb: "TMDB's own",
};

export function isRecommendationSource(value: unknown): value is RecommendationSource {
  return value === "reel" || value === "tmdb";
}

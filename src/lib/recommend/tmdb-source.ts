import "server-only";

import { titleId } from "@/lib/library/types";
import { normalizeSearchResult } from "@/lib/tmdb/normalize";
import { tmdbGetSafe } from "@/lib/tmdb/server";
import type { TmdbPaginated, TmdbSearchResult } from "@/lib/tmdb/types";

import type { ProfileAnchor, TasteProfile } from "./profile";
import type { TmdbCandidate } from "./tmdb-ranking";

/**
 * A deliberately naive baseline: whatever TMDB's own /recommendations feed
 * returns for the titles you liked, ranked by TMDB's ordering rather than by
 * anything this app computes.
 *
 * It uses the same anchors as the custom model on purpose. Holding the seeds
 * constant means any difference in output comes from the ranking, which is the
 * only honest way to compare the two.
 */

const ANCHOR_LIMIT = 12;
const PAGES_PER_ANCHOR = 2;

function anchorsOf(profile: TasteProfile): ProfileAnchor[] {
  return profile.anchors.slice(0, ANCHOR_LIMIT);
}

/** Fetch and merge TMDB's recommendation feeds for the user's strongest titles. */
export async function collectTmdbCandidates(
  profile: TasteProfile,
  exclude: Set<string>,
): Promise<TmdbCandidate[]> {
  const anchors = anchorsOf(profile);

  const responses = await Promise.all(
    anchors.flatMap((anchor) =>
      Array.from({ length: PAGES_PER_ANCHOR }, (_, index) => index + 1).map(async (page) => ({
        anchor,
        page,
        data: await tmdbGetSafe<TmdbPaginated<TmdbSearchResult>>(
          `${anchor.mediaType}/${anchor.tmdbId}/recommendations`,
          { page },
          { revalidate: 60 * 60 * 12 },
        ),
      })),
    ),
  );

  const pool = new Map<string, TmdbCandidate>();

  for (const { anchor, page, data } of responses) {
    (data?.results ?? []).forEach((result, index) => {
      const normalized = normalizeSearchResult(result, anchor.mediaType);
      if (!normalized) return;

      const key = titleId(normalized.mediaType, normalized.tmdbId);
      if (exclude.has(key)) return;

      const position = (page - 1) * 20 + index;
      const existing = pool.get(key);

      if (existing) {
        existing.anchorCount += 1;
        existing.bestPosition = Math.min(existing.bestPosition, position);
        if (!existing.via.some((entry) => entry.title === anchor.title)) {
          existing.via.push({ title: anchor.title, rating: anchor.rating });
        }
        return;
      }

      pool.set(key, {
        ...normalized,
        key,
        anchorCount: 1,
        bestPosition: position,
        via: [{ title: anchor.title, rating: anchor.rating }],
      });
    });
  }

  return [...pool.values()];
}

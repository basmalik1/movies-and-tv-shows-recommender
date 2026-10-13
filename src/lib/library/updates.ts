import { formatEpisodeCode } from "./progress";
import type { TrackedTitle } from "./types";

/**
 * Working out what changed after re-reading a title from TMDB.
 *
 * Pure on purpose: a refresh that just says "checked 14 titles" tells you
 * nothing you wanted to know. The question is always whether anything new was
 * announced, so the diff is the feature and gets tested like one.
 */

export type UpdateKind =
  | "new-season"
  | "episode-scheduled"
  | "date-moved"
  | "season-dated"
  | "ended"
  | "release-moved";

export interface TitleUpdate {
  id: string;
  tmdbId: number;
  mediaType: TrackedTitle["mediaType"];
  title: string;
  kind: UpdateKind;
  summary: string;
}

/**
 * Titles worth rechecking for future releases.
 *
 * Deliberately narrower than "everything tracked": a film you watched in 2019
 * is never going to gain a release date, and including it just makes the check
 * slower for no benefit.
 */
export function followedTitles(titles: TrackedTitle[]): TrackedTitle[] {
  return titles.filter((title) => {
    if (title.status === "dropped") return false;

    if (title.mediaType === "movie") {
      // Only films you have not seen can still have a release ahead of them.
      return title.status !== "completed";
    }

    // Any series you are mid-way through, plus finished ones that may return.
    if (title.status === "watching") return true;
    return title.inProduction || title.showStatus === "Returning Series";
  });
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function base(title: TrackedTitle) {
  return {
    id: title.id,
    tmdbId: title.tmdbId,
    mediaType: title.mediaType,
    title: title.title,
  };
}

/** Everything newsworthy between the stored copy of a title and a fresh one. */
export function diffTitle(before: TrackedTitle, after: TrackedTitle): TitleUpdate[] {
  const updates: TitleUpdate[] = [];

  if (after.mediaType === "movie") {
    if (before.date !== after.date && after.date) {
      updates.push({
        ...base(after),
        kind: "release-moved",
        summary: before.date
          ? `Release moved to ${formatDate(after.date)}`
          : `Release date set: ${formatDate(after.date)}`,
      });
    }
    return updates;
  }

  const beforeSeasons = new Set(before.seasons.map((season) => season.seasonNumber));
  for (const season of after.seasons) {
    if (season.seasonNumber <= 0 || beforeSeasons.has(season.seasonNumber)) continue;
    updates.push({
      ...base(after),
      kind: "new-season",
      summary: season.airDate
        ? `Season ${season.seasonNumber} announced for ${formatDate(season.airDate)}`
        : `Season ${season.seasonNumber} announced`,
    });
  }

  // A season that existed but had no date, and now has one.
  for (const season of after.seasons) {
    if (season.seasonNumber <= 0 || !season.airDate) continue;
    const previous = before.seasons.find((s) => s.seasonNumber === season.seasonNumber);
    if (previous && !previous.airDate) {
      updates.push({
        ...base(after),
        kind: "season-dated",
        summary: `Season ${season.seasonNumber} dated for ${formatDate(season.airDate)}`,
      });
    }
  }

  const wasNext = before.nextAiredEpisode;
  const isNext = after.nextAiredEpisode;

  if (!wasNext && isNext?.airDate) {
    updates.push({
      ...base(after),
      kind: "episode-scheduled",
      summary: `${formatEpisodeCode(isNext.season, isNext.episode)} scheduled for ${formatDate(isNext.airDate)}`,
    });
  } else if (
    wasNext &&
    isNext?.airDate &&
    wasNext.season === isNext.season &&
    wasNext.episode === isNext.episode &&
    wasNext.airDate !== isNext.airDate
  ) {
    // Same episode, different date — the one case that is genuinely a reschedule
    // rather than the show simply moving on to its next episode.
    updates.push({
      ...base(after),
      kind: "date-moved",
      summary: `${formatEpisodeCode(isNext.season, isNext.episode)} moved to ${formatDate(isNext.airDate)}`,
    });
  }

  if (before.showStatus !== "Ended" && after.showStatus === "Ended") {
    updates.push({ ...base(after), kind: "ended", summary: "Has now ended" });
  }

  return updates;
}

export interface UpdateReport {
  checked: number;
  failed: number;
  updates: TitleUpdate[];
}

/** One line for the UI, phrased around whether anything actually changed. */
export function summarizeReport(report: UpdateReport): string {
  const { checked, failed, updates } = report;

  if (checked === 0) {
    return "Nothing to check — no shows you follow have a future release to track.";
  }

  const suffix = failed > 0 ? ` ${failed} could not be reached.` : "";
  const noun = checked === 1 ? "title" : "titles";

  if (updates.length === 0) {
    return `Checked ${checked} ${noun}. Nothing new announced.${suffix}`;
  }

  const changed = new Set(updates.map((update) => update.id)).size;
  return `Checked ${checked} ${noun}. ${updates.length} update${
    updates.length === 1 ? "" : "s"
  } across ${changed} show${changed === 1 ? "" : "s"}.${suffix}`;
}

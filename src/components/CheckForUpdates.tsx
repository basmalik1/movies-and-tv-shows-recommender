"use client";

import Link from "next/link";
import { useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";
import { summarizeReport, type TitleUpdate, type UpdateReport } from "@/lib/library/updates";

import { RefreshIcon, SparkIcon } from "./icons";

const KIND_TONE: Record<TitleUpdate["kind"], string> = {
  "new-season": "border-gold-500/30 bg-gold-500/10 text-gold-400",
  "season-dated": "border-gold-500/30 bg-gold-500/10 text-gold-400",
  "episode-scheduled": "border-accent-600/40 bg-accent-600/15 text-accent-400",
  "date-moved": "border-accent-600/40 bg-accent-600/15 text-accent-400",
  ended: "border-ink-600 bg-ink-800 text-ink-300",
  "release-moved": "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const KIND_LABEL: Record<TitleUpdate["kind"], string> = {
  "new-season": "New season",
  "season-dated": "Dated",
  "episode-scheduled": "Scheduled",
  "date-moved": "Rescheduled",
  ended: "Ended",
  "release-moved": "Release",
};

/**
 * Rechecks the titles that can still gain a future release and reports what
 * changed. Distinct from the full resync in Settings, which touches everything
 * including films you finished years ago.
 */
export function CheckForUpdates({ className = "" }: { className?: string }) {
  const { checkForUpdates, ready } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<UpdateReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await checkForUpdates());
    } catch {
      setError("Could not reach TMDB. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy || !ready}
        onClick={() => void run()}
      >
        <RefreshIcon width={15} height={15} className={busy ? "animate-spin" : ""} />
        {busy ? "Checking…" : "Check for updates"}
      </button>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      {report && (
        <div className="mt-2">
          <p className="text-xs text-ink-400">{summarizeReport(report)}</p>

          {report.updates.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {report.updates.map((update) => (
                <li key={`${update.id}:${update.kind}:${update.summary}`}>
                  <Link
                    href={`/title/${update.mediaType}/${update.tmdbId}`}
                    className="card flex flex-wrap items-center gap-2 px-3 py-2 text-xs transition-colors hover:border-ink-600"
                  >
                    <SparkIcon width={13} height={13} className="shrink-0 text-accent-400" />
                    <span className="font-medium text-ink-100">{update.title}</span>
                    <span className={`chip ${KIND_TONE[update.kind]}`}>
                      {KIND_LABEL[update.kind]}
                    </span>
                    <span className="text-ink-400">{update.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

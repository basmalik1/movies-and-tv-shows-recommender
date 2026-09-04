"use client";

import { useRef, useState } from "react";

import { useLibrary } from "@/lib/library/LibraryProvider";

import { RefreshIcon, TrashIcon } from "./icons";
import { ErrorNotice, PageHeader, Spinner } from "./ui";

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-400">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const { titles, ready, exportLibrary, importLibrary, clearLibrary, refreshAll } = useLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"refresh" | "import" | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  function download() {
    const blob = new Blob([JSON.stringify(exportLibrary(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reel-library-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${titles.length} titles.`);
    setError(null);
  }

  async function handleImport(file: File, mode: "merge" | "replace") {
    setBusy("import");
    setMessage(null);
    setError(null);
    try {
      const count = await importLibrary(JSON.parse(await file.text()), mode);
      setMessage(`Imported ${count} titles (${mode}).`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that file.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function refresh() {
    setBusy("refresh");
    setMessage(null);
    setError(null);
    try {
      const count = await refreshAll();
      setMessage(`Refreshed metadata for ${count} ${count === 1 ? "title" : "titles"}.`);
    } catch {
      setError("Could not reach TMDB.");
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return (
      <div>
        <PageHeader title="Settings" />
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Your library lives in this browser's IndexedDB. Nothing is uploaded, so back it up if it matters to you."
      />

      {message && <p className="mb-4 text-sm text-emerald-300">{message}</p>}
      {error && (
        <div className="mb-4">
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Back up your library"
          description={`Downloads all ${titles.length} tracked titles, ratings and episode ticks as a single JSON file.`}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={download}
            disabled={titles.length === 0}
          >
            Export JSON
          </button>
        </Panel>

        <Panel
          title="Restore from a backup"
          description="Merge keeps whichever copy of each title was updated most recently. Replace wipes what is here first."
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="input mb-3 file:mr-3 file:rounded file:border-0 file:bg-ink-700 file:px-2 file:py-1 file:text-xs file:text-ink-100"
            aria-label="Choose a library export file"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== null}
              onClick={() => {
                const file = fileRef.current?.files?.[0];
                if (file) void handleImport(file, "merge");
                else setError("Choose a file first.");
              }}
            >
              Merge
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== null}
              onClick={() => {
                const file = fileRef.current?.files?.[0];
                if (file) void handleImport(file, "replace");
                else setError("Choose a file first.");
              }}
            >
              Replace
            </button>
          </div>
        </Panel>

        <Panel
          title="Refresh metadata"
          description="Re-reads every tracked title from TMDB to pick up newly announced seasons, air dates and episode counts, and to refresh the tags your recommendations are built from. Your ratings and ticks are untouched."
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void refresh()}
            disabled={busy !== null || titles.length === 0}
          >
            <RefreshIcon
              width={15}
              height={15}
              className={busy === "refresh" ? "animate-spin" : ""}
            />
            {busy === "refresh" ? "Refreshing…" : "Refresh everything"}
          </button>
        </Panel>

        <Panel
          title="Delete everything"
          description="Clears the local database. This cannot be undone, so export first if you might want it back."
        >
          {confirmingClear ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-rose-300">
                Delete all {titles.length} titles permanently?
              </span>
              <button
                type="button"
                className="btn bg-rose-600 text-white hover:bg-rose-500"
                onClick={async () => {
                  await clearLibrary();
                  setConfirmingClear(false);
                  setMessage("Library cleared.");
                }}
              >
                Yes, delete
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost text-ink-400 hover:text-rose-300"
              disabled={titles.length === 0}
              onClick={() => setConfirmingClear(true)}
            >
              <TrashIcon width={15} height={15} />
              Clear library
            </button>
          )}
        </Panel>
      </div>

      <p className="mt-6 text-xs text-ink-400">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}

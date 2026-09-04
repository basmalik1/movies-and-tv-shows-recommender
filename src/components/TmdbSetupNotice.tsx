export function TmdbSetupNotice() {
  return (
    <div className="card mx-auto max-w-2xl p-6">
      <h2 className="text-lg font-semibold">Connect TMDB to get started</h2>
      <p className="mt-2 text-sm text-ink-400">
        Reel reads film and series data from The Movie Database. It needs a free API token before
        anything will load.
      </p>

      <ol className="mt-4 space-y-2.5 text-sm text-ink-300">
        <li>
          <span className="mr-2 font-semibold text-ink-100">1.</span>
          Create a free account at{" "}
          <a
            href="https://www.themoviedb.org/signup"
            target="_blank"
            rel="noreferrer"
            className="text-accent-400 underline underline-offset-2"
          >
            themoviedb.org
          </a>
          .
        </li>
        <li>
          <span className="mr-2 font-semibold text-ink-100">2.</span>
          Go to Settings → API and request a Developer key.
        </li>
        <li>
          <span className="mr-2 font-semibold text-ink-100">3.</span>
          Copy <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-xs">.env.example</code>{" "}
          to <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-xs">.env.local</code> and
          paste the API Read Access Token into{" "}
          <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-xs">TMDB_ACCESS_TOKEN</code>
          .
        </li>
        <li>
          <span className="mr-2 font-semibold text-ink-100">4.</span>
          Restart the dev server.
        </li>
      </ol>
    </div>
  );
}

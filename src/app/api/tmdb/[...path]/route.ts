import { NextResponse } from "next/server";

import { hasTmdbCredentials, tmdbGet, TmdbRequestError } from "@/lib/tmdb/server";

/**
 * Read-only TMDB proxy.
 *
 * The browser never sees the API credentials, and an explicit allowlist keeps
 * this from becoming an open relay to arbitrary TMDB (or, via a crafted path,
 * arbitrary internal) endpoints.
 */
const ALLOWED_PATHS: RegExp[] = [
  /^search\/(multi|movie|tv)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/(recommendations|similar|credits|keywords|watch\/providers)$/,
  /^tv\/\d+\/season\/\d+$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
  /^discover\/(movie|tv)$/,
  /^genre\/(movie|tv)\/list$/,
  /^(movie|tv)\/(popular|top_rated|upcoming|on_the_air|airing_today)$/,
];

const FORWARDED_PARAMS = new Set([
  "query",
  "page",
  "language",
  "region",
  "append_to_response",
  "sort_by",
  "with_genres",
  "with_keywords",
  "without_genres",
  "vote_count.gte",
  "vote_average.gte",
  "primary_release_year",
  "first_air_date_year",
  "with_original_language",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  const path = segments.join("/");

  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return NextResponse.json(
      { error: `Endpoint "${path}" is not exposed by this proxy.` },
      { status: 404 },
    );
  }

  if (!hasTmdbCredentials()) {
    return NextResponse.json(
      {
        error:
          "TMDB is not configured. Copy .env.example to .env.local and set TMDB_ACCESS_TOKEN, then restart the dev server.",
        code: "tmdb_not_configured",
      },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url).searchParams;
  const params: Record<string, string> = {};
  for (const [key, value] of incoming.entries()) {
    if (FORWARDED_PARAMS.has(key)) params[key] = value;
  }

  try {
    const data = await tmdbGet<unknown>(path, params, { revalidate: 60 * 60 });
    return NextResponse.json(data, {
      headers: { "cache-control": "private, max-age=300" },
    });
  } catch (error) {
    if (error instanceof TmdbRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Upstream request failed." }, { status: 502 });
  }
}

import { DashboardView } from "@/components/DashboardView";
import { TmdbSetupNotice } from "@/components/TmdbSetupNotice";
import { normalizeSearchResult } from "@/lib/tmdb/normalize";
import { getTrending, hasTmdbCredentials } from "@/lib/tmdb/server";
import type { NormalizedTitle } from "@/lib/tmdb/types";

async function loadTrending(): Promise<NormalizedTitle[]> {
  try {
    const page = await getTrending("week");
    return page.results
      .map((result) => normalizeSearchResult(result))
      .filter((title): title is NormalizedTitle => title !== null);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  if (!hasTmdbCredentials()) return <TmdbSetupNotice />;
  return <DashboardView trending={await loadTrending()} />;
}

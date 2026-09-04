import { Suspense } from "react";
import type { Metadata } from "next";

import { SearchView } from "@/components/SearchView";
import { TmdbSetupNotice } from "@/components/TmdbSetupNotice";
import { Spinner } from "@/components/ui";
import { hasTmdbCredentials } from "@/lib/tmdb/server";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  if (!hasTmdbCredentials()) return <TmdbSetupNotice />;
  return (
    <Suspense fallback={<Spinner label="Loading search…" />}>
      <SearchView />
    </Suspense>
  );
}

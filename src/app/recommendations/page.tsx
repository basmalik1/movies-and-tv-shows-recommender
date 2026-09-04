import type { Metadata } from "next";

import { RecommendationsView } from "@/components/RecommendationsView";
import { TmdbSetupNotice } from "@/components/TmdbSetupNotice";
import { hasTmdbCredentials } from "@/lib/tmdb/server";

export const metadata: Metadata = { title: "For you" };

export default function RecommendationsPage() {
  if (!hasTmdbCredentials()) return <TmdbSetupNotice />;
  return <RecommendationsView />;
}

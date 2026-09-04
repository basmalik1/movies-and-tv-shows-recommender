import type { Metadata } from "next";

import { CalendarView } from "@/components/CalendarView";
import { TmdbSetupNotice } from "@/components/TmdbSetupNotice";
import { hasTmdbCredentials } from "@/lib/tmdb/server";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  if (!hasTmdbCredentials()) return <TmdbSetupNotice />;
  return <CalendarView />;
}

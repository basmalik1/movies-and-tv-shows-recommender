import type { Metadata } from "next";

import { UpcomingView } from "@/components/UpcomingView";

export const metadata: Metadata = { title: "Upcoming" };

export default function UpcomingPage() {
  return <UpcomingView />;
}

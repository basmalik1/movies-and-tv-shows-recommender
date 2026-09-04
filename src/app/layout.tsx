import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/AppShell";
import { LibraryProvider } from "@/lib/library/LibraryProvider";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Reel — track what you watch, find what is next",
    template: "%s · Reel",
  },
  description:
    "Open-source tracker for films and TV: log what you have seen, follow upcoming episodes and seasons, and get explained recommendations built from your own taste.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <LibraryProvider>
          <AppShell>{children}</AppShell>
        </LibraryProvider>
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLibrary } from "@/lib/library/LibraryProvider";

import {
  CalendarIcon,
  HomeIcon,
  LibraryIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
} from "./icons";

const NAV = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/upcoming", label: "Upcoming", Icon: CalendarIcon },
  { href: "/recommendations", label: "For you", Icon: SparkIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { titles, ready } = useLibrary();

  const counts = {
    library: titles.length,
    upcoming: titles.filter((title) => title.nextAiredEpisode !== null).length,
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col lg:flex-row">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/85 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Reel
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={`rounded-lg p-2 transition-colors ${
                  isActive(pathname, href)
                    ? "bg-ink-800 text-accent-400"
                    : "text-ink-400 hover:text-ink-100"
                }`}
              >
                <Icon />
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-800 px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Link href="/" className="mb-8 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-600 text-sm font-bold text-ink-950">
            R
          </span>
          <span className="text-lg font-semibold tracking-tight">Reel</span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            const badge =
              href === "/library" && counts.library > 0
                ? counts.library
                : href === "/upcoming" && counts.upcoming > 0
                  ? counts.upcoming
                  : null;

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-ink-800 text-ink-100"
                    : "text-ink-400 hover:bg-ink-850 hover:text-ink-200"
                }`}
              >
                <Icon className={active ? "text-accent-400" : ""} />
                <span className="flex-1">{label}</span>
                {ready && badge !== null && (
                  <span className="rounded-full bg-ink-700 px-1.5 py-0.5 text-[0.65rem] font-semibold text-ink-300">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-3 pt-6 text-[0.7rem] leading-relaxed text-ink-400">
          <p>Your library is stored locally in this browser.</p>
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-ink-300 underline underline-offset-2 hover:text-accent-400"
          >
            Data from TMDB
          </a>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}

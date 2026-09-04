import Image from "next/image";

import { posterUrl } from "@/lib/tmdb/images";
import { STATUS_LABELS, type WatchStatus } from "@/lib/library/types";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-ink-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-300">{title}</h2>
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-medium text-ink-200">{title}</p>
      <div className="max-w-md text-sm text-ink-400">{children}</div>
    </div>
  );
}

const STATUS_STYLES: Record<WatchStatus, string> = {
  watchlist: "border-ink-600 bg-ink-800 text-ink-300",
  watching: "border-accent-600/40 bg-accent-600/15 text-accent-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  dropped: "border-rose-500/25 bg-rose-500/10 text-rose-300",
};

export function StatusBadge({ status }: { status: WatchStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {label && <p className="mt-1 text-[0.7rem] text-ink-400">{label}</p>}
    </div>
  );
}

export function Poster({
  path,
  alt,
  priority = false,
  sizes = "(max-width: 640px) 45vw, 190px",
}: {
  path: string | null;
  alt: string;
  priority?: boolean;
  sizes?: string;
}) {
  const url = posterUrl(path, "w342");

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-800 p-3 text-center text-[0.7rem] leading-tight text-ink-400">
        {alt}
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-accent-500" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      {children}
    </div>
  );
}

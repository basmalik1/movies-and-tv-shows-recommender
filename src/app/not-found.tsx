import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-sm uppercase tracking-widest text-accent-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold">We could not find that title</h1>
      <p className="mt-2 text-sm text-ink-400">
        It may have been removed from TMDB, or the link is wrong.
      </p>
      <Link href="/search" className="btn btn-primary mt-6">
        Search instead
      </Link>
    </div>
  );
}

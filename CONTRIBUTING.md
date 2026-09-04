# Contributing to Reel

Thanks for taking a look. Bug reports, feature ideas and pull requests are all welcome.

## Getting set up

```bash
npm install
cp .env.example .env.local   # then paste your TMDB read access token
npm run dev
```

A free TMDB Developer token is required for anything to load — see the
[Quick start](README.md#quick-start) in the README.

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test
```

CI runs exactly these, plus a production build without credentials — the app is expected
to render its setup notice rather than crash when TMDB is not configured.

## How the code is organised

- `src/lib/` holds the logic and has no React in it apart from the library provider.
  Anything you can test without a browser belongs here.
- `src/components/` holds the UI. Server components fetch, client components interact.
- `src/app/` is routing and a thin composition layer over the two.

Two rules keep the project tractable:

1. **Persistence goes through `LibraryRepository`.** Do not reach for `indexedDB`
   directly outside `src/lib/library/indexeddb.ts`. The interface is what will let hosted
   sync land later without a rewrite.
2. **TMDB credentials stay on the server.** Browser-side reads go through `/api/tmdb`. If
   you need a new endpoint, add it to the allowlist in
   `src/app/api/tmdb/[...path]/route.ts` rather than widening the pattern.

## Testing

Tests live next to what they cover (`*.test.ts`) and run on Vitest. Fixtures come from
`src/lib/test-utils.ts` — extend those helpers rather than hand-rolling a `TrackedTitle`.

Changes to the recommender should come with a test that states the behaviour in terms of
outcomes ("a keyword shared by two loved titles outranks one seen once") rather than
asserting on exact score values, which are expected to move as weights are tuned.

## Style

- TypeScript everywhere, no `any`.
- Comments explain *why*, not *what*. If a constant encodes a judgement call — a half-life,
  a neutral rating, a weight — say what the judgement was.
- Keep dependencies minimal. The app currently ships with no runtime dependencies beyond
  Next and React; please do not add one without a reason in the PR description.

## Reporting a bug

Include what you did, what happened, what you expected, and whether your library was
involved (an export attached as JSON helps enormously — it contains no personal data
beyond what you have tracked).

## Code of conduct

Be decent to each other. Harassment, personal attacks, and bad-faith argument are not
welcome here, and maintainers will remove comments, commits, issues and pull requests that
cross that line.

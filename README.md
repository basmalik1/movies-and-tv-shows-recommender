# Reel

Track what you have watched, follow the episodes and seasons still to come, and get
recommendations that explain themselves.

Most trackers stop at "here is a list". Reel builds a weighted taste profile from your
own library and shows the reasoning behind every suggestion — which of your titles led
there, which themes matched, and how strongly.

- **Local-first.** Your library lives in the browser's IndexedDB. No account, no server,
  nothing uploaded. Export and re-import it as JSON whenever you like.
- **Real episode tracking.** Tick off individual episodes, whole seasons, or everything
  up to a point. Progress is measured against episodes that have actually aired.
- **A forward calendar.** Upcoming episodes, announced season premieres, and unreleased
  films from your watchlist, grouped by date.
- **An explainable recommender.** Not a passthrough of someone else's API endpoint — see
  [How the recommender works](#how-the-recommender-works).

---

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer and a free TMDB API token.

```bash
git clone <your-fork-url> reel
cd reel
npm install
cp .env.example .env.local
```

Get a token:

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup).
2. Go to **Settings → API** and request a **Developer** key.
3. Copy the **API Read Access Token** (the long string starting `eyJ`).
4. Paste it into `.env.local` as `TMDB_ACCESS_TOKEN`.

Then:

```bash
npm run dev
```

Open <http://localhost:3000>. The app tells you what is missing if the token is absent,
so you will not be staring at a blank screen.

---

## How the recommender works

The pipeline lives in [`src/lib/recommend/`](src/lib/recommend) and runs server-side at
`POST /api/recommendations`. It has four stages.

### 1. Profile — `profile.ts`

Every tracked title contributes a **signed signal**:

```
signal = statusWeight × sentiment × recencyDecay
```

- **Status weight** — finishing something (`1.0`) says far more than adding it to a
  watchlist (`0.35`).
- **Sentiment** — a rating maps onto `[-1, 1]` with the neutral point at **6.5**, not at
  the middle of the scale, because people rarely finish things they hate. An unrated
  title falls back to an implicit value for its status; an unrated *dropped* title counts
  as a rejection.
- **Recency decay** — an 18-month half-life, floored at `0.55`, so old favourites still
  count but current taste leads.
- **Engagement** — a series rated highly after two episodes is a weaker endorsement than
  one rated highly after finishing it. Floored at `0.65`, because plenty of people rate a
  show without ever ticking an episode and should not be penalised for it. Films are
  unaffected.

Ratings on series count exactly as much as ratings on films: nothing in the profile
branches on media type.

Before any of that, keywords are filtered ([`keywords.ts`](src/lib/tmdb/keywords.ts)).
TMDB mixes real themes with bookkeeping — production trivia (`sequel`, `woman director`),
source notes (`based on novel or book`), and places, which it stores as combined strings
like `los angeles, california`. Left in, they produce matches such as "shares themes you
gravitate to: los angeles". Crew is filtered too: directors, writers and creators count,
producers do not, since they track studio and budget rather than anything a viewer
responds to.

The surviving signal is spread across the title's genres, keywords, cast and creators, divided by
`√(feature count)` so a title tagged with forty keywords cannot drown out one tagged with
four. Features are then **shrunk toward zero by their support** (`n / (n + 1.5)`), so a
single obscure keyword from one title does not hijack the profile, and each family of
features is L2-normalized into a unit vector.

Because disliked titles carry a *negative* signal into the same vectors, "things you
avoid" is handled by the same arithmetic as "things you like" — no separate penalty pass.

### 2. Candidates — `candidates.ts`

Three complementary strategies fan out across TMDB in parallel:

| Source | What it contributes | Weight |
| --- | --- | --- |
| `/recommendations` on your top 12 anchors | Titles TMDB's own co-watch data links to yours | 1.0 |
| `/similar` on the same anchors | Looser content matches | 0.7 |
| `/discover` by your top genres and keywords | Titles nothing in your library points at | 0.5–0.6 |
| Weekly trending | A small tail, so a thin library still returns something | 0.25 |

Anchor-derived sources are scaled by how strongly you liked the anchor. Everything
already in your library is excluded. Duplicates are merged, keeping every source that
surfaced them — agreement across independent sources is itself a signal.

### 3. Score — `score.ts`

Fetching credits and keywords for the whole pool would be hundreds of requests, so a cheap
**prescore** (source agreement + genre cosine + quality prior) narrows it to 40, which are
enriched with bounded concurrency and then scored properly:

| Component | Weight | What it measures |
| --- | --- | --- |
| Keyword cosine | 0.34 | Thematic overlap — the strongest signal |
| Source agreement | 0.18 | How many of your titles independently point here |
| People cosine | 0.14 | Recurring cast, directors, creators |
| Genre cosine | 0.12 | Broad category fit |
| Quality prior | 0.10 | Bayesian-smoothed TMDB rating |
| Novelty | 0.07 | Mild edge to titles you have not been shown everywhere |
| Era affinity | 0.03 | Distance from your era centre |
| Language affinity | 0.02 | Share of your library in that language |

Both cosines are **IDF-weighted against the live candidate pool**. Without that, breadth
beats precision: `Drama` sits on most candidates and `workplace` on a great many, so a
plain cosine rewards titles that share nothing but a category. Weighting by
`log((N+1)/(df+0.5))` pushes the score toward the tags that actually separate one
candidate from another — the difference between matching on `workplace` and matching on
`cyberpunk, tech noir`.

Source agreement is held deliberately low. TMDB's own `/recommendations` skews hard
toward whatever is widely watched, so leaning on it surfaces the same handful of
blockbuster dramas regardless of who is asking.

The quality prior is a **Bayesian average** against a 6.5 mean with a 500-vote prior, so a
10.0 backed by three votes cannot outrank an 8.4 backed by twenty thousand. Source
agreement uses `1 − e^(−Σweights)`, so a fourth mention adds much less than the second.

The 0-100 shown on each card is a presentation scale over the blended cosine. Only the
ordering carries meaning; it is not a probability.

Results are paged rather than capped. Each page advances through the prescored pool and
enriches the next slice, so scrolling costs one enrich pass per page and never re-ranks
from scratch. The client sends back the keys it has already shown, so a title can never
appear twice even if the pool shifts between requests.

### 4. Diversify — `score.ts`

Raw scores tend to return ten variations on one franchise. **Maximal Marginal Relevance**
repeatedly picks the best remaining title after penalising it for resembling what has
already been chosen (Jaccard similarity over genres and keywords, `λ = 0.35`).

Each result carries the reasons that produced it: the anchor title and your rating of it,
the matched themes, the recurring names.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── recommendations/route.ts   POST — runs the pipeline
│   │   └── tmdb/[...path]/route.ts    Allowlisted read-only TMDB proxy
│   ├── title/[mediaType]/[id]/        Detail page, cast, themes, episode tracker
│   ├── library/ search/ upcoming/     Client views
│   ├── recommendations/ settings/
│   └── layout.tsx  page.tsx           Shell + dashboard
├── components/                        Presentational + interactive UI
└── lib/
    ├── library/                       Domain model, IndexedDB repository, progress maths
    ├── recommend/                     profile → candidates → score → engine
    ├── tmdb/                          Typed client (server + browser), normalization
    └── upcoming.ts                    Library → forward calendar
```

Two decisions worth calling out:

**Persistence is behind an interface.** Everything goes through `LibraryRepository`
([`src/lib/library/types.ts`](src/lib/library/types.ts)). `IndexedDbLibraryRepository` is
the current implementation and `MemoryLibraryRepository` covers SSR and tests. Adding
accounts and a hosted database later is one new implementation, not a rewrite.

**Feature ids are denormalized onto each tracked title.** When you track something, its
genres, keywords, cast and creators are stored with it. The profile builder therefore
needs zero network calls, and the whole engine is testable with plain object fixtures.

**Credentials never reach the browser.** Server components call TMDB directly; the browser
goes through `/api/tmdb`, which enforces an explicit path allowlist and a parameter
allowlist so it cannot be turned into an open relay.

---

## Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm run start       # serve the production build
npm test            # run the test suite once
npm run test:watch  # re-run tests on change
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```

The test suite covers the parts where a silent bug would be invisible: signal weighting,
feature normalization, scoring and diversification, aired-vs-announced episode maths, and
schedule building.

---

## Roadmap

- [ ] Optional hosted sync (Postgres + auth) behind the existing repository interface
- [ ] Watch-provider availability per region
- [ ] Statistics view: genre drift over time, most-watched people
- [ ] "Because you are in the mood for…" — ad-hoc profile overrides
- [ ] Trakt / Letterboxd / IMDb CSV import

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE).

This product uses the TMDB API but is not endorsed or certified by TMDB.

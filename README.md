# musix

**Every track on the record, plotted.**

musix is [seriesgraph](https://www.seriesgraph.com/) for music. Instead of episodes
of a TV show scattered across seasons, it plots every *track* of an artist's
discography across their albums — so the shape of a career, or of a single record,
is visible at a glance.

Two lines run across every chart:

| | What it is |
|---|---|
| **Public score** (blue) | An aggregate of publicly available reception signals — MusicBrainz community star ratings, Deezer play-rank, Last.fm scrobbles — composited onto a 0–10 scale. |
| **User score** (orange) | The plain mean of musix members' own 1–10 ratings. No weighting, no blending. |

Where the two diverge is usually the interesting part of a record.

---

## An honest note on the public score

No free, keyless API publishes **per-track critic review scores**. Metacritic,
Pitchfork and Album of the Year have no open API, and their terms do not permit
scraping. So musix does not pretend to show a critics' average.

What it shows instead is a composite of the public reception signals that genuinely
*are* openly available:

| Signal | Source | Weight | What it measures |
|---|---|---|---|
| Community star rating (recording) | MusicBrainz | up to 3.0 | Actual public votes on that specific track |
| Community star rating (release group) | MusicBrainz | up to 1.2 | Album-level votes, used as a prior for tracks with none |
| Listener rank | Deezer | 1.0 | How much the track is actually played |
| Scrobble count | Last.fm *(optional)* | 1.0 | Long-tail listening, when an API key is configured |

The MusicBrainz weights scale with vote count — one vote barely moves the number;
five or more is treated as a settled community opinion. Popularity counts are mapped
onto 0–10 through a logistic curve over their order of magnitude, because play counts
span six decades and linear scaling would flatten everything below the megahits.

**Every track shows its own working.** Click any point on the graph, or any row in
the table, and the detail panel lists exactly which signals fed that number, what
the raw upstream figures were, and how much each one counted. A confidence figure
says how much evidence is behind the score. Tracks with no public signals show `—`
rather than a fabricated number.

The user score has none of this complexity: it is the arithmetic mean of what musix
members rated, and it is the half of the chart that is genuinely ours.

## Data sources

All keyless and free except where noted. Nothing is scraped from HTML.

- **[iTunes Search API](https://performance-partners.apple.com/search-api)** — tracklists, disc/track ordering, album artwork, 30-second previews. The spine of the catalogue.
- **[MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API)** — community ratings and release metadata. Rate limited to ~1 request/second and requires a descriptive `User-Agent`; both are honoured (`api/_lib/musicbrainz.ts`).
- **[Cover Art Archive](https://coverartarchive.org/)** — album artwork by release group.
- **[Deezer](https://developers.deezer.com/api)** — per-track popularity rank and album fan counts.
- **[Last.fm](https://www.last.fm/api)** — optional; needs a free API key. Without one the module no-ops and the score is built from the rest.

## Architecture

```
Browser (React + Vite)
  │
  ├── /api/*            Vercel serverless functions
  │     ├─ search       iTunes search, pass-through
  │     ├─ artist/:id   discography + already-cached tracks
  │     └─ album/:id    tracklist, enrichment, public-score computation
  │                     ↳ writes the catalogue with the service-role key
  │
  └── Supabase (direct) auth + reading/writing the user's own ratings
```

The split matters:

- **Catalogue tables** (`artists`, `albums`, `tracks`) are written *only* by the
  serverless functions using the service-role key. The browser can read them and
  nothing else. This keeps upstream rate limiting, retries and score computation on
  the server, and out of reach of the client.
- **Ratings** go the other way: written straight from the browser under the user's
  own JWT, with row level security enforcing that a row's `user_id` is the caller's.

The artist page deliberately does not walk every album's tracklist in one request —
that would mean dozens of rate-limited MusicBrainz round trips. It returns the
discography immediately along with whatever is already cached, then hydrates the
remaining albums through `/api/album/:id` three at a time, filling the graph in as
the responses land.

### Layout

```
api/
  _lib/            upstream clients, the score model, shared helpers
  search.ts        GET /api/search?q=
  artist/[id].ts   GET /api/artist/:id
  album/[id].ts    GET /api/album/:id
src/
  components/      chart, table, rating strip, score breakdown, auth
  lib/             api client, Supabase client, auth context, rating writes
  pages/           home, search, artist, album
supabase/
  migrations/      schema, RLS policies, read models
```

## The chart

The chart follows one rule that shapes everything else: **colour encodes the two
scores, not the albums.** Scatter forms only reliably distinguish three categorical
hues under colour-vision deficiency, and a discography has far more albums than
that. So albums are encoded by contiguous x-position, alternating background bands
and direct axis labels — which is how a seriesgraph-style plot actually reads — and
the two hues are spent on the thing the chart is about.

The two-slot palette (`#2a78d6` / `#eb6834` light, `#3987e5` / `#d95926` dark)
passes every all-pairs gate in both light and dark mode: CVD ΔE 24.7 / 26.8,
normal-vision ΔE 33.6 / 31.8, both above 3:1 contrast against their surfaces.

The table below every chart is its accessible twin — every value the graph encodes
is readable there as text, so nothing is gated behind hover or colour.

### The rating grid

Alongside the line chart, every page carries a seriesgraph-style grid: one cell per
track, showing its 1–10 score and shaded by it. On an artist page the grid is albums
across, track numbers down, so a whole discography reads as one colour field; on an
album page the tracks flow across in a single band. Cells are clickable and share the
graph's selection, and the metric toggle switches between the public score, the musix
user score and your own ratings.

Colour here encodes **magnitude**, not identity, so it uses a sequential ramp — a
single hue per series, running light-to-dark on the light surface and dark-to-light
on the dark one, never a rainbow. The hue follows the series it is showing (blue for
the public score, orange for anything user-derived), which keeps the grid and the
line chart speaking the same language. Each of the ten steps ships the ink colour
that clears 4.5:1 against it, so the number inside a cell is always legible; the
ramps were generated in OKLCH and contrast-checked rather than eyeballed. A scale
legend sits above every grid, an unrated track is drawn as an empty dashed cell so it
can never be mistaken for a low score, and the 1–10 rating strip is painted from the
same ramp so it doubles as the key.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local     # fill in your Supabase project details
npm run dev
```

`npm run dev` serves the frontend only. To run the serverless functions locally,
use the Vercel CLI:

```bash
npx vercel dev
```

### Database

Apply the migrations in `supabase/migrations/` in order, either through the
Supabase SQL editor or with the CLI:

```bash
supabase db push
```

They create the catalogue and ratings tables, enable row level security with the
policies described above, and define the `track_user_scores`, `v_tracks` and
`v_albums` read models.

### Environment variables

See `.env.example`. On Vercel, set the same variables in **Project → Settings →
Environment Variables**. `SUPABASE_SERVICE_ROLE_KEY` must never be given a `VITE_`
prefix — that would bundle it into the client.

If the Supabase variables are missing the app still runs: it serves the catalogue
and public scores, and shows a banner naming the variable that is missing or
unusable.

The browser credentials are accepted under any of the names below, resolved at
build time in this order, so the Vercel Supabase integration's own variables work
without hand-made `VITE_` copies:

| | Accepted names |
|---|---|
| URL | `VITE_SUPABASE_URL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` |
| anon key | `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Every build prints which ones it resolved:
`[musix] client Supabase config: url=SUPABASE_URL key=SUPABASE_ANON_KEY`, or
`MISSING`. Read that line in the Vercel build log before debugging anything else.

Two things still catch people out on Vercel:

- **These two values must be type *Config*, not *Secret*.** They are public by
  design — the anon key ships to the browser and RLS is what guards the data. A
  secret is write-only and cannot be converted afterwards, so a variable saved as
  Secret has to be deleted and re-created as Config. Keep
  `SUPABASE_SERVICE_ROLE_KEY` secret; it must never reach the client, and the
  build fails outright if it is ever found in a client variable.
- **They are inlined at build time**, so adding or editing one has no effect
  until you redeploy.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typechecks (`tsc -b`, all three projects) then builds |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build |

## A note on imports under `api/`

Relative imports inside `api/` carry explicit `.js` extensions
(`import { fetchJson } from './http.js'`) even though the files are `.ts`.

This is not optional. `package.json` sets `"type": "module"`, so Vercel compiles
each function as NodeNext ESM, where extensionless relative specifiers are a
`TS2835` error and — because Vercel type-checks but still deploys — the function
ships anyway and then dies at runtime with `ERR_MODULE_NOT_FOUND`. The symptom is
every `/api/*` call returning a platform error page instead of JSON.

`tsconfig.api.json` therefore mirrors Vercel exactly (`module` and
`moduleResolution` both `nodenext`), so `npm run build` fails locally on the same
error rather than letting it reach production. Do not switch it to `bundler`
resolution to make an import "work" — that only hides the failure until deploy.

## Licence

The code is MIT. The music metadata belongs to its sources — MusicBrainz data is
released under CC0 / CC BY-NC-SA depending on the field, and the iTunes, Deezer and
Last.fm APIs each carry their own terms. Check them before deploying this anywhere
commercial.

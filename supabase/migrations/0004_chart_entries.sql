-- musix: year-end singles chart placings
--
-- Why this table exists: every other signal in the score measures *current*
-- listening, so it reads an older record as a worse one. A year-end chart
-- placing is historical and does not decay — a 2013 placing is as true now as
-- it was then — which makes it the one piece of evidence in the model that is
-- immune to recency bias.
--
-- Only the ranking itself is stored: year, position, title, artist. Those are
-- facts about what charted, not anyone's editorial writing.

create table if not exists public.chart_entries (
  id          bigserial primary key,
  -- Where the ranking came from, so a source can be re-pulled or retired
  -- without disturbing the others.
  source      text    not null default 'top40weekly',
  chart       text    not null default 'year_end_singles',
  year        int     not null,
  rank        int     not null check (rank > 0),
  title       text    not null,
  artist      text    not null,
  -- Normalised forms for matching against catalogue titles, which differ in
  -- punctuation, case, and featured-artist formatting. Written by the API
  -- using the same compactKey() the search ranker uses, so the two agree.
  title_key   text    not null,
  artist_key  text    not null,
  fetched_at  timestamptz not null default now(),
  unique (source, chart, year, rank)
);

-- The hot path is "what did this track ever peak at", so index the match keys.
create index if not exists chart_entries_keys_idx
  on public.chart_entries (title_key, artist_key);
create index if not exists chart_entries_title_idx
  on public.chart_entries (title_key);

alter table public.chart_entries enable row level security;

-- Chart data is public, like the rest of the catalogue. Writes happen through
-- the refresh endpoint using the service role key, which bypasses RLS.
drop policy if exists "chart entries are readable by everyone" on public.chart_entries;
create policy "chart entries are readable by everyone" on public.chart_entries
  for select to anon, authenticated using (true);

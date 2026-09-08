-- musix: row level security and read models

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.artists  enable row level security;
alter table public.albums   enable row level security;
alter table public.tracks   enable row level security;
alter table public.ratings  enable row level security;

-- Catalogue is public read-only. Writes happen through the serverless API
-- using the service role key, which bypasses RLS.
drop policy if exists "catalogue is readable by everyone" on public.artists;
create policy "catalogue is readable by everyone" on public.artists
  for select to anon, authenticated using (true);

drop policy if exists "catalogue is readable by everyone" on public.albums;
create policy "catalogue is readable by everyone" on public.albums
  for select to anon, authenticated using (true);

drop policy if exists "catalogue is readable by everyone" on public.tracks;
create policy "catalogue is readable by everyone" on public.tracks
  for select to anon, authenticated using (true);

-- Profiles: world readable, self writable.
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone" on public.profiles
  for select to anon, authenticated using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Ratings: world readable (they are the community score), self writable.
drop policy if exists "ratings are readable by everyone" on public.ratings;
create policy "ratings are readable by everyone" on public.ratings
  for select to anon, authenticated using (true);

drop policy if exists "users insert own ratings" on public.ratings;
create policy "users insert own ratings" on public.ratings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users update own ratings" on public.ratings;
create policy "users update own ratings" on public.ratings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete own ratings" on public.ratings;
create policy "users delete own ratings" on public.ratings
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------- read models

-- Aggregate of musix user ratings, per track.
create or replace view public.track_user_scores
with (security_invoker = true) as
select
  r.track_id,
  round(avg(r.score)::numeric, 2) as user_score,
  count(*)::integer               as user_rating_count
from public.ratings r
group by r.track_id;

-- One row per track carrying both scores plus enough album/artist context to
-- drive the graph without a second round trip.
create or replace view public.v_tracks
with (security_invoker = true) as
select
  t.id,
  t.album_id,
  al.artist_id,
  al.title            as album_title,
  al.artist_name,
  al.cover_url,
  al.release_date,
  al.album_type,
  t.title,
  t.disc_number,
  t.track_number,
  t.duration_ms,
  t.preview_url,
  t.explicit,
  t.public_score,
  t.public_score_sources,
  s.user_score,
  coalesce(s.user_rating_count, 0) as user_rating_count
from public.tracks t
join public.albums al on al.id = t.album_id
left join public.track_user_scores s on s.track_id = t.id;

-- Album-level rollup of both scores.
create or replace view public.v_albums
with (security_invoker = true) as
select
  al.*,
  round(avg(t.public_score)::numeric, 2)                     as tracks_public_score,
  round(avg(s.user_score)::numeric, 2)                       as tracks_user_score,
  coalesce(sum(s.user_rating_count), 0)::integer             as user_rating_count,
  count(t.id)::integer                                       as tracks_loaded
from public.albums al
left join public.tracks t on t.album_id = al.id
left join public.track_user_scores s on s.track_id = t.id
group by al.id;

grant select on public.track_user_scores to anon, authenticated;
grant select on public.v_tracks          to anon, authenticated;
grant select on public.v_albums          to anon, authenticated;

-- musix: initial schema
-- Catalogue tables are populated server-side (service role) from public music APIs.
-- Ratings are written by authenticated users and guarded by RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- catalogue

create table if not exists public.artists (
  id               uuid primary key default gen_random_uuid(),
  itunes_artist_id bigint unique,
  mb_artist_id     uuid,
  name             text not null,
  genre            text,
  image_url        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.albums (
  id                   uuid primary key default gen_random_uuid(),
  artist_id            uuid references public.artists (id) on delete cascade,
  itunes_collection_id bigint unique,
  mb_release_group_id  uuid,
  title                text not null,
  artist_name          text not null,
  release_date         date,
  cover_url            text,
  cover_url_large      text,
  genre                text,
  track_count          integer,
  album_type           text not null default 'album',
  -- album-level aggregate of public reviews (0-10), sourced from MusicBrainz
  -- release-group community ratings; see api/_lib/score.ts.
  public_score         numeric(4,2),
  public_score_sources jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.tracks (
  id                   uuid primary key default gen_random_uuid(),
  album_id             uuid not null references public.albums (id) on delete cascade,
  itunes_track_id      bigint unique,
  mb_recording_id      uuid,
  title                text not null,
  disc_number          integer not null default 1,
  track_number         integer not null default 1,
  duration_ms          integer,
  preview_url          text,
  explicit             boolean not null default false,
  -- composite of publicly available review/popularity signals, 0-10
  public_score         numeric(4,2),
  public_score_sources jsonb not null default '{}'::jsonb,
  public_score_updated_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists albums_artist_id_idx on public.albums (artist_id);
create index if not exists albums_release_date_idx on public.albums (release_date);
create index if not exists tracks_album_id_idx on public.tracks (album_id);
create unique index if not exists tracks_album_position_idx
  on public.tracks (album_id, disc_number, track_number);

-- ---------------------------------------------------------------- ratings

create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  track_id   uuid not null references public.tracks (id) on delete cascade,
  score      numeric(3,1) not null check (score >= 1 and score <= 10),
  review     text check (char_length(review) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);

create index if not exists ratings_track_id_idx on public.ratings (track_id);
create index if not exists ratings_user_id_idx on public.ratings (user_id);

-- ---------------------------------------------------------------- touch trigger

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists artists_touch on public.artists;
create trigger artists_touch before update on public.artists
  for each row execute function public.touch_updated_at();
drop trigger if exists albums_touch on public.albums;
create trigger albums_touch before update on public.albums
  for each row execute function public.touch_updated_at();
drop trigger if exists tracks_touch on public.tracks;
create trigger tracks_touch before update on public.tracks
  for each row execute function public.touch_updated_at();
drop trigger if exists ratings_touch on public.ratings;
create trigger ratings_touch before update on public.ratings
  for each row execute function public.touch_updated_at();

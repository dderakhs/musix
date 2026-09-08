/**
 * GET /api/artist/:id  ->  artist plus their main releases
 *
 * `:id` is either an iTunes artistId or a musix artist uuid.
 *
 * This deliberately returns *no track data*. It used to hand back every cached
 * track and let the client hydrate the rest, which meant one artist page could
 * fan out into dozens of album requests, each doing rate-limited MusicBrainz,
 * Genius and Reddit lookups — minutes of loading for a page that only needed to
 * list records. Tracks are now fetched once, when a specific album is opened.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { artworkAt, classifyAlbum, lookupArtistDiscography } from '../_lib/itunes.js';
import { fetchArtistTop, searchArtists as searchDeezerArtists } from '../_lib/deezer.js';
import { cacheHeaders } from '../_lib/http.js';
import { compactKey } from '../_lib/match.js';
import { baseTitleKey, mainReleases } from '../_lib/releases.js';
import { serviceClient } from '../_lib/supabase.js';
import { param, requireGet, sendError, sendJson } from '../_lib/respond.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveItunesArtistId(id: string): Promise<number | null> {
  if (/^\d+$/.test(id)) return Number(id);
  if (!UUID_RE.test(id)) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db.from('artists').select('itunes_artist_id').eq('id', id).maybeSingle();
  return data?.itunes_artist_id ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;

  const rawId = param(req, 'id');
  if (!rawId) {
    sendJson(res, 400, { error: 'Missing artist id' });
    return;
  }

  try {
    const itunesArtistId = await resolveItunesArtistId(rawId);
    if (itunesArtistId === null) {
      sendJson(res, 404, { error: 'Unknown artist id' });
      return;
    }

    const { artist, albums } = await lookupArtistDiscography(itunesArtistId);
    if (!artist) {
      sendJson(res, 404, { error: 'Artist not found on iTunes' });
      return;
    }

    // One Deezer round trip gives both the artist photo and an ordering of their
    // records by how much popular material each one carries.
    const deezerArtist = await searchDeezerArtists(artist.artistName, 5)
      .then((list) => list.find((a) => compactKey(a.name) === compactKey(artist.artistName)) ?? list[0] ?? null)
      .catch(() => null);

    const top = deezerArtist ? await fetchArtistTop(deezerArtist.id).catch(() => null) : null;

    const popularityByTitle = new Map<string, number>();
    for (const [title, rank] of top?.rankByAlbumTitle ?? []) {
      const key = baseTitleKey(title);
      popularityByTitle.set(key, (popularityByTitle.get(key) ?? 0) + rank);
    }

    const ranked = mainReleases(albums, popularityByTitle).sort((a, b) => {
      if (b.popularity !== a.popularity) return b.popularity - a.popularity;
      return (b.album.releaseDate ?? '').localeCompare(a.album.releaseDate ?? '');
    });

    // Keep the catalogue rows fresh, but never block the response on it.
    const db = serviceClient();
    let artistId: string | null = null;
    if (db) {
      const { data } = await db
        .from('artists')
        .upsert(
          {
            itunes_artist_id: artist.artistId,
            name: artist.artistName,
            genre: artist.primaryGenreName ?? null,
            image_url: deezerArtist?.imageUrl ?? null,
          },
          { onConflict: 'itunes_artist_id' },
        )
        .select('id')
        .maybeSingle();
      artistId = data?.id ?? null;
    }

    sendJson(
      res,
      200,
      {
        artist: {
          id: artistId,
          itunesArtistId: artist.artistId,
          name: artist.artistName,
          genre: artist.primaryGenreName ?? null,
          imageUrl: deezerArtist?.imageUrl ?? null,
          fans: deezerArtist?.fans ?? 0,
        },
        albums: ranked.map(({ album, popularity }) => ({
          id: null,
          itunesCollectionId: album.collectionId,
          title: album.collectionName,
          artistName: album.artistName,
          releaseDate: album.releaseDate ?? null,
          genre: album.primaryGenreName ?? null,
          trackCount: album.trackCount ?? null,
          albumType: classifyAlbum(album),
          coverUrl: artworkAt(album.artworkUrl100, 300),
          coverUrlLarge: artworkAt(album.artworkUrl100, 600),
          popularity,
          publicScore: null,
        })),
      },
      cacheHeaders(60 * 60 * 12),
    );
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * GET /api/artist/:id  ->  artist, chronological discography, and any tracks
 *                          already in the catalogue
 *
 * `:id` is either an iTunes artistId or a musix artist uuid.
 *
 * Deliberately cheap: it does not walk every album's tracklist (that would mean
 * dozens of rate-limited MusicBrainz round trips in one request). It returns the
 * discography immediately plus whatever tracks are already cached, and the client
 * hydrates the remaining albums through /api/album/:id, filling the graph in as
 * the responses land.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { artworkAt, classifyAlbum, lookupArtistDiscography } from '../_lib/itunes.js';
import { cacheHeaders } from '../_lib/http.js';
import { serviceClient } from '../_lib/supabase.js';
import { param, requireGet, sendError, sendJson } from '../_lib/respond.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveItunesArtistId(id: string): Promise<number | null> {
  if (/^\d+$/.test(id)) return Number(id);
  if (!UUID_RE.test(id)) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db
    .from('artists')
    .select('itunes_artist_id')
    .eq('id', id)
    .maybeSingle();
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

    // Chronological, like seasons of a show. Undated releases sort last.
    const ordered = [...albums].sort((a, b) => {
      const da = a.releaseDate ?? '9999';
      const db_ = b.releaseDate ?? '9999';
      return da.localeCompare(db_);
    });

    const db = serviceClient();
    let artistId: string | null = null;
    let albumRows: Record<string, unknown>[] = [];
    let trackRows: Record<string, unknown>[] = [];

    if (db) {
      const { data: artistRow } = await db
        .from('artists')
        .upsert(
          {
            itunes_artist_id: artist.artistId,
            name: artist.artistName,
            genre: artist.primaryGenreName ?? null,
          },
          { onConflict: 'itunes_artist_id' },
        )
        .select('id')
        .maybeSingle();
      artistId = artistRow?.id ?? null;

      if (artistId && ordered.length > 0) {
        const { error } = await db.from('albums').upsert(
          ordered.map((a) => ({
            artist_id: artistId,
            itunes_collection_id: a.collectionId,
            title: a.collectionName,
            artist_name: a.artistName,
            release_date: a.releaseDate ? a.releaseDate.slice(0, 10) : null,
            cover_url: artworkAt(a.artworkUrl100, 300),
            cover_url_large: artworkAt(a.artworkUrl100, 1000),
            genre: a.primaryGenreName ?? null,
            track_count: a.trackCount ?? null,
            album_type: classifyAlbum(a),
          })),
          { onConflict: 'itunes_collection_id', ignoreDuplicates: false },
        );
        if (error) console.error('[musix] album upsert failed', error);

        const [{ data: av }, { data: tv }] = await Promise.all([
          db
            .from('v_albums')
            .select(
              'id, itunes_collection_id, public_score, tracks_public_score, tracks_user_score, user_rating_count, tracks_loaded',
            )
            .eq('artist_id', artistId),
          db
            .from('v_tracks')
            .select(
              'id, album_id, album_title, title, disc_number, track_number, duration_ms, preview_url, explicit, public_score, public_score_sources, user_score, user_rating_count',
            )
            .eq('artist_id', artistId),
        ]);
        albumRows = av ?? [];
        trackRows = tv ?? [];
      }
    }

    const statsByCollection = new Map(
      albumRows.map((r) => [Number(r.itunes_collection_id), r]),
    );

    sendJson(
      res,
      200,
      {
        artist: {
          id: artistId,
          itunesArtistId: artist.artistId,
          name: artist.artistName,
          genre: artist.primaryGenreName ?? null,
        },
        albums: ordered.map((a) => {
          const stats = statsByCollection.get(a.collectionId);
          return {
            id: (stats?.id as string) ?? null,
            itunesCollectionId: a.collectionId,
            title: a.collectionName,
            artistName: a.artistName,
            releaseDate: a.releaseDate ?? null,
            genre: a.primaryGenreName ?? null,
            trackCount: a.trackCount ?? null,
            albumType: classifyAlbum(a),
            coverUrl: artworkAt(a.artworkUrl100, 300),
            coverUrlLarge: artworkAt(a.artworkUrl100, 600),
            publicScore: stats?.public_score == null ? null : Number(stats.public_score),
            tracksPublicScore:
              stats?.tracks_public_score == null ? null : Number(stats.tracks_public_score),
            tracksUserScore:
              stats?.tracks_user_score == null ? null : Number(stats.tracks_user_score),
            userRatingCount: Number(stats?.user_rating_count ?? 0),
            tracksLoaded: Number(stats?.tracks_loaded ?? 0),
          };
        }),
        tracks: trackRows.map((r) => ({
          id: r.id as string,
          albumId: r.album_id as string,
          albumTitle: r.album_title as string,
          title: r.title as string,
          discNumber: Number(r.disc_number),
          trackNumber: Number(r.track_number),
          durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
          previewUrl: (r.preview_url as string | null) ?? null,
          explicit: Boolean(r.explicit),
          publicScore: r.public_score == null ? null : Number(r.public_score),
          publicScoreSources: r.public_score_sources,
          userScore: r.user_score == null ? null : Number(r.user_score),
          userRatingCount: Number(r.user_rating_count ?? 0),
        })),
      },
      cacheHeaders(60 * 5),
    );
  } catch (err) {
    sendError(res, err);
  }
}

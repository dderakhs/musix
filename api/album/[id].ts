/**
 * GET /api/album/:id  ->  album + full tracklist with both scores
 *
 * `:id` is either an iTunes collectionId or a musix album uuid.
 *
 * This is where the catalogue actually gets built. iTunes supplies the
 * tracklist and artwork; MusicBrainz, Deezer and (optionally) Last.fm supply the
 * reception signals that make up the public score. Everything is written back to
 * Supabase so repeat visits and the artist graph are served from our own tables.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  artworkAt,
  classifyAlbum,
  lookupAlbumTracks,
  type ItunesAlbum,
  type ItunesTrack,
} from '../_lib/itunes.js';
import { cacheHeaders, normaliseTitle } from '../_lib/http.js';
import { fetchAlbumRatings, findReleaseGroup, type MbTrackRatings } from '../_lib/musicbrainz.js';
import { fetchAlbumPopularity, findAlbum, type DeezerAlbumData } from '../_lib/deezer.js';
import { fetchAlbumListeners, type LastfmAlbumData } from '../_lib/lastfm.js';
import { computePublicScore, type PublicScore } from '../_lib/score.js';
import { serviceClient } from '../_lib/supabase.js';
import { param, requireGet, sendError, sendJson } from '../_lib/respond.js';

/** MusicBrainz is rate limited to ~1 req/s; give enrichment a hard ceiling. */
const ENRICHMENT_BUDGET_MS = 9000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OutTrack {
  id: string | null;
  itunesTrackId: number;
  title: string;
  discNumber: number;
  trackNumber: number;
  durationMs: number | null;
  previewUrl: string | null;
  explicit: boolean;
  publicScore: number | null;
  publicScoreSources: PublicScore;
  userScore: number | null;
  userRatingCount: number;
}

/** Resolve a musix uuid to the iTunes id we actually fetch with. */
async function resolveCollectionId(id: string): Promise<number | null> {
  if (/^\d+$/.test(id)) return Number(id);
  if (!UUID_RE.test(id)) return null;
  const db = serviceClient();
  if (!db) return null;
  const { data } = await db
    .from('albums')
    .select('itunes_collection_id')
    .eq('id', id)
    .maybeSingle();
  return data?.itunes_collection_id ?? null;
}

/** MusicBrainz lookup, abandoned rather than allowed to blow the time budget. */
async function enrichMusicBrainz(
  artist: string,
  album: string,
  deadline: number,
): Promise<MbTrackRatings | null> {
  if (Date.now() > deadline) return null;
  const rgId = await findReleaseGroup(artist, album);
  if (!rgId || Date.now() > deadline) return rgId ? { releaseGroupId: rgId, releaseGroupRating: null, byTitle: new Map() } : null;
  return fetchAlbumRatings(rgId);
}

async function enrichDeezer(artist: string, album: string): Promise<DeezerAlbumData | null> {
  const albumId = await findAlbum(artist, album);
  if (!albumId) return null;
  return fetchAlbumPopularity(albumId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;

  const rawId = param(req, 'id');
  if (!rawId) {
    sendJson(res, 400, { error: 'Missing album id' });
    return;
  }

  try {
    const collectionId = await resolveCollectionId(rawId);
    if (collectionId === null) {
      sendJson(res, 404, { error: 'Unknown album id' });
      return;
    }

    const { album, tracks } = await lookupAlbumTracks(collectionId);
    if (!album) {
      sendJson(res, 404, { error: 'Album not found on iTunes' });
      return;
    }

    const deadline = Date.now() + ENRICHMENT_BUDGET_MS;
    const [mb, deezer, lastfm] = await Promise.all([
      enrichMusicBrainz(album.artistName, album.collectionName, deadline).catch(() => null),
      enrichDeezer(album.artistName, album.collectionName).catch(() => null),
      fetchAlbumListeners(album.artistName, album.collectionName).catch(
        () => null as LastfmAlbumData | null,
      ),
    ]);

    const releaseGroupRating =
      mb?.releaseGroupRating && mb.releaseGroupRating.value != null
        ? { value: mb.releaseGroupRating.value, votes: mb.releaseGroupRating['votes-count'] }
        : null;

    const scored = tracks.map((t) => {
      const key = normaliseTitle(t.trackName);
      const rec = mb?.byTitle.get(key);
      const score = computePublicScore({
        recordingRating: rec?.value != null ? { value: rec.value, votes: rec['votes-count'] } : null,
        releaseGroupRating,
        deezerRank: deezer?.rankByTitle.get(key) ?? null,
        lastfmPlays: lastfm?.listenersByTitle.get(key) ?? null,
      });
      return { track: t, score };
    });

    const albumScore = computePublicScore({ releaseGroupRating });
    const out = await persist({ album, mb, scored, albumScore });

    sendJson(
      res,
      200,
      {
        album: {
          id: out.albumId,
          itunesCollectionId: album.collectionId,
          itunesArtistId: album.artistId ?? null,
          artistId: out.artistId,
          title: album.collectionName,
          artistName: album.artistName,
          releaseDate: album.releaseDate ?? null,
          genre: album.primaryGenreName ?? null,
          albumType: classifyAlbum(album),
          trackCount: album.trackCount ?? tracks.length,
          coverUrl: artworkAt(album.artworkUrl100, 300),
          coverUrlLarge: artworkAt(album.artworkUrl100, 1000),
          mbReleaseGroupId: mb?.releaseGroupId ?? null,
          publicScore: albumScore.score,
          publicScoreSources: albumScore,
        },
        tracks: out.tracks,
        sources: {
          itunes: true,
          musicbrainz: Boolean(mb),
          deezer: Boolean(deezer),
          lastfm: Boolean(lastfm),
        },
      },
      // Short cache: user scores are part of this payload and must stay fresh.
      cacheHeaders(60 * 5),
    );
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * Write the catalogue rows and read the user scores back. Degrades to an
 * in-memory response when Supabase is not configured.
 */
async function persist(args: {
  album: ItunesAlbum;
  mb: MbTrackRatings | null;
  scored: Array<{ track: ItunesTrack; score: PublicScore }>;
  albumScore: PublicScore;
}): Promise<{ albumId: string | null; artistId: string | null; tracks: OutTrack[] }> {
  const { album, mb, scored, albumScore } = args;

  const bare = (): OutTrack[] =>
    scored.map(({ track, score }) => ({
      id: null,
      itunesTrackId: track.trackId,
      title: track.trackName,
      discNumber: track.discNumber ?? 1,
      trackNumber: track.trackNumber ?? 0,
      durationMs: track.trackTimeMillis ?? null,
      previewUrl: track.previewUrl ?? null,
      explicit: track.trackExplicitness === 'explicit',
      publicScore: score.score,
      publicScoreSources: score,
      userScore: null,
      userRatingCount: 0,
    }));

  const db = serviceClient();
  if (!db) return { albumId: null, artistId: null, tracks: bare() };

  let artistId: string | null = null;
  if (album.artistId) {
    const { data } = await db
      .from('artists')
      .upsert(
        {
          itunes_artist_id: album.artistId,
          name: album.artistName,
          genre: album.primaryGenreName ?? null,
        },
        { onConflict: 'itunes_artist_id' },
      )
      .select('id')
      .maybeSingle();
    artistId = data?.id ?? null;
  }

  const { data: albumRow, error: albumErr } = await db
    .from('albums')
    .upsert(
      {
        artist_id: artistId,
        itunes_collection_id: album.collectionId,
        mb_release_group_id: mb?.releaseGroupId ?? null,
        title: album.collectionName,
        artist_name: album.artistName,
        release_date: album.releaseDate ? album.releaseDate.slice(0, 10) : null,
        cover_url: artworkAt(album.artworkUrl100, 300),
        cover_url_large: artworkAt(album.artworkUrl100, 1000),
        genre: album.primaryGenreName ?? null,
        track_count: album.trackCount ?? scored.length,
        album_type: classifyAlbum(album),
        public_score: albumScore.score,
        public_score_sources: albumScore,
      },
      { onConflict: 'itunes_collection_id' },
    )
    .select('id')
    .maybeSingle();

  if (albumErr || !albumRow) {
    console.error('[musix] album upsert failed', albumErr);
    return { albumId: null, artistId, tracks: bare() };
  }

  // Drop rows iTunes no longer lists, so the (album, disc, track) unique index
  // cannot collide when a release is re-issued with different track ids.
  // An empty keep-list has to skip the NOT IN entirely: `in ()` is a syntax error.
  const keepIds = scored.map(({ track }) => track.trackId);
  const stale = db.from('tracks').delete().eq('album_id', albumRow.id);
  await (keepIds.length > 0
    ? stale.not('itunes_track_id', 'in', `(${keepIds.join(',')})`)
    : stale);

  const seen = new Set<string>();
  const rows = scored
    .filter(({ track }) => {
      // Guard the (album, disc, track) unique index against upstream duplicates.
      const pos = `${track.discNumber ?? 1}:${track.trackNumber ?? 0}`;
      if (seen.has(pos)) return false;
      seen.add(pos);
      return true;
    })
    .map(({ track, score }) => ({
      album_id: albumRow.id,
      itunes_track_id: track.trackId,
      title: track.trackName,
      disc_number: track.discNumber ?? 1,
      track_number: track.trackNumber ?? 0,
      duration_ms: track.trackTimeMillis ?? null,
      preview_url: track.previewUrl ?? null,
      explicit: track.trackExplicitness === 'explicit',
      public_score: score.score,
      public_score_sources: score,
      public_score_updated_at: new Date().toISOString(),
    }));

  const { error: trackErr } = await db
    .from('tracks')
    .upsert(rows, { onConflict: 'itunes_track_id' });
  if (trackErr) console.error('[musix] track upsert failed', trackErr);

  const { data: view } = await db
    .from('v_tracks')
    .select(
      'id, itunes_track_id, title, disc_number, track_number, duration_ms, preview_url, explicit, public_score, public_score_sources, user_score, user_rating_count',
    )
    .eq('album_id', albumRow.id);

  const tracks: OutTrack[] = (view ?? [])
    .map((r) => ({
      id: r.id as string,
      itunesTrackId: Number(r.itunes_track_id),
      title: r.title as string,
      discNumber: r.disc_number as number,
      trackNumber: r.track_number as number,
      durationMs: (r.duration_ms as number | null) ?? null,
      previewUrl: (r.preview_url as string | null) ?? null,
      explicit: Boolean(r.explicit),
      publicScore: r.public_score === null ? null : Number(r.public_score),
      publicScoreSources: r.public_score_sources as PublicScore,
      userScore: r.user_score === null ? null : Number(r.user_score),
      userRatingCount: Number(r.user_rating_count ?? 0),
    }))
    .sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber);

  return {
    albumId: albumRow.id as string,
    artistId,
    tracks: tracks.length > 0 ? tracks : bare(),
  };
}

/**
 * GET /api/search?q=...  ->  { artists, albums, songs }
 *
 * iTunes supplies the catalogue matches; Deezer supplies artist photos and fan
 * counts, which iTunes has no equivalent of. The fan count is what makes the
 * ranking useful: a search for "drake" should lead with Drake, not with whichever
 * same-named act iTunes happened to return first.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  artworkAt,
  classifyAlbum,
  searchAlbums,
  searchArtists,
  searchSongs,
} from './_lib/itunes.js';
import { searchArtists as searchDeezerArtists } from './_lib/deezer.js';
import { cacheHeaders, normaliseTitle } from './_lib/http.js';
import { param, requireGet, sendError, sendJson } from './_lib/respond.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;

  const q = param(req, 'q');
  if (!q) {
    sendJson(res, 400, { error: 'Missing required query parameter "q"' });
    return;
  }

  try {
    const [artists, albums, songs, deezerArtists] = await Promise.all([
      searchArtists(q, 20),
      searchAlbums(q, 16),
      searchSongs(q, 16),
      searchDeezerArtists(q, 12).catch(() => []),
    ]);

    const wanted = normaliseTitle(q);

    // Deezer's photos and fan counts, keyed by normalised name so they can be
    // matched to the iTunes results.
    const deezerByName = new Map(deezerArtists.map((a) => [normaliseTitle(a.name), a]));

    const rankedArtists = artists
      // Only acts whose name actually contains what was typed. iTunes' artist
      // search is loose and otherwise returns names with no relation to the query.
      .filter((a) => normaliseTitle(a.artistName).includes(wanted))
      .map((a) => {
        const name = normaliseTitle(a.artistName);
        const deezer = deezerByName.get(name);
        return {
          itunesArtistId: a.artistId,
          name: a.artistName,
          genre: a.primaryGenreName ?? null,
          imageUrl: deezer?.imageUrl ?? null,
          fans: deezer?.fans ?? 0,
          exact: name === wanted,
        };
      })
      .sort((a, b) => {
        // An exact name match is the artist being looked for, whatever its
        // catalogue size; everything else falls back to audience size.
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        return b.fans - a.fans;
      })
      .slice(0, 8);

    sendJson(
      res,
      200,
      {
        query: q,
        artists: rankedArtists,
        albums: albums.map((a) => ({
          itunesCollectionId: a.collectionId,
          itunesArtistId: a.artistId ?? null,
          title: a.collectionName,
          artistName: a.artistName,
          releaseDate: a.releaseDate ?? null,
          genre: a.primaryGenreName ?? null,
          trackCount: a.trackCount ?? null,
          albumType: classifyAlbum(a),
          coverUrl: artworkAt(a.artworkUrl100, 300),
        })),
        songs: songs.map((t) => ({
          itunesTrackId: t.trackId,
          itunesCollectionId: t.collectionId,
          title: t.trackName,
          artistName: t.artistName,
          coverUrl: artworkAt(t.artworkUrl100, 200),
          durationMs: t.trackTimeMillis ?? null,
        })),
      },
      cacheHeaders(60 * 60 * 6),
    );
  } catch (err) {
    sendError(res, err);
  }
}

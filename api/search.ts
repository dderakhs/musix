/**
 * GET /api/search?q=...  ->  { artists, albums }
 *
 * Straight pass-through of the iTunes Search API, trimmed to the fields the UI
 * needs. Nothing is persisted here; a search result only becomes a catalogue row
 * once someone opens the artist or album page.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { artworkAt, classifyAlbum, searchAlbums, searchArtists } from './_lib/itunes.js';
import { cacheHeaders } from './_lib/http.js';
import { param, requireGet, sendError, sendJson } from './_lib/respond.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;

  const q = param(req, 'q');
  if (!q) {
    sendJson(res, 400, { error: 'Missing required query parameter "q"' });
    return;
  }

  try {
    const [artists, albums] = await Promise.all([searchArtists(q, 8), searchAlbums(q, 16)]);

    sendJson(
      res,
      200,
      {
        query: q,
        artists: artists.map((a) => ({
          itunesArtistId: a.artistId,
          name: a.artistName,
          genre: a.primaryGenreName ?? null,
        })),
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
      },
      cacheHeaders(60 * 60 * 6),
    );
  } catch (err) {
    sendError(res, err);
  }
}

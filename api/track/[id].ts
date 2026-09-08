/**
 * GET /api/track/:id  ->  which album a song belongs to
 *
 * A single has no album page of its own to link to, so searching a song (or
 * clicking one in the popular rail) resolves through here to the collection it
 * lives on. The album page then renders it — as a one-cell page when the
 * "album" really is just that single.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { lookupTrack } from '../_lib/itunes.js';
import { cacheHeaders } from '../_lib/http.js';
import { param, requireGet, sendError, sendJson } from '../_lib/respond.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;

  const id = param(req, 'id');
  if (!id || !/^\d+$/.test(id)) {
    sendJson(res, 400, { error: 'Track id must be an iTunes track id' });
    return;
  }

  try {
    const track = await lookupTrack(Number(id));
    if (!track) {
      sendJson(res, 404, { error: 'Track not found on iTunes' });
      return;
    }
    sendJson(
      res,
      200,
      {
        itunesTrackId: track.trackId,
        itunesCollectionId: track.collectionId,
        title: track.trackName,
        artistName: track.artistName,
      },
      cacheHeaders(60 * 60 * 24),
    );
  } catch (err) {
    sendError(res, err);
  }
}

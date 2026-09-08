/**
 * GET /api/charts  ->  { songs, albums }
 *
 * Feeds the popular rails and the charts page. Pure pass-through; the edge cache
 * absorbs the traffic since these move at most daily.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchTopAlbums, fetchTopSongs } from './_lib/charts.js';
import { cacheHeaders } from './_lib/http.js';
import { param, requireGet, sendError, sendJson } from './_lib/respond.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;
  try {
    const requested = Number(param(req, 'limit') ?? 100);
    const limit = Number.isFinite(requested) ? Math.min(200, Math.max(10, requested)) : 100;
    const [songs, albums] = await Promise.all([
      fetchTopSongs(limit).catch(() => []),
      fetchTopAlbums(limit).catch(() => []),
    ]);
    sendJson(res, 200, { songs, albums }, cacheHeaders(60 * 60 * 6));
  } catch (err) {
    sendError(res, err);
  }
}

/**
 * GET /api/charts  ->  the current most-played songs
 *
 * Feeds the popular rail on the home page. Pure pass-through; nothing is
 * persisted, and the edge cache absorbs the traffic since the chart moves daily.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchTopSongs } from './_lib/charts.js';
import { cacheHeaders } from './_lib/http.js';
import { param, requireGet, sendError, sendJson } from './_lib/respond.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;
  try {
    const requested = Number(param(req, 'limit') ?? 100);
    const limit = Number.isFinite(requested) ? Math.min(100, Math.max(10, requested)) : 100;
    const songs = await fetchTopSongs(limit);
    sendJson(res, 200, { songs }, cacheHeaders(60 * 60 * 6));
  } catch (err) {
    sendError(res, err);
  }
}

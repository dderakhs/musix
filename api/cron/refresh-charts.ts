/**
 * GET /api/cron/refresh-charts  ->  { years, written }
 *
 * Pulls year-end singles rankings from top40weekly and stores them. Run weekly
 * by Vercel Cron (see vercel.json).
 *
 * Weekly is the right cadence even though year-end charts settle once a year:
 * the current year's page is revised as the year runs, and a weekly pull keeps
 * it current without ever hammering the source. Older years are re-fetched only
 * when asked for, because a settled year does not change.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { saveRankings } from '../_lib/chartstore.js';
import { fetchYear } from '../_lib/top40.js';
import { sendError, sendJson } from '../_lib/respond.js';

/** How many years back a scheduled run refreshes. */
const DEFAULT_LOOKBACK = 3;

/**
 * Vercel signs scheduled invocations with CRON_SECRET. When it is set the
 * endpoint refuses anything that does not carry it, so a public URL cannot be
 * used to drive traffic at the upstream.
 */
function authorised(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!authorised(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const now = new Date().getUTCFullYear();
    const fromParam = Number(req.query.from);
    const toParam = Number(req.query.to);
    const to = Number.isFinite(toParam) ? toParam : now;
    const from = Number.isFinite(fromParam) ? fromParam : to - DEFAULT_LOOKBACK + 1;

    const years: Array<{ year: number; parsed: number; written: number; error?: string }> = [];
    let written = 0;

    // Sequential on purpose: this is a courtesy load on someone else's site,
    // and a weekly job has no reason to be in a hurry.
    for (let year = Math.min(from, to); year <= Math.max(from, to); year += 1) {
      try {
        const rankings = await fetchYear(year);
        const saved = await saveRankings(rankings);
        written += saved;
        years.push({ year, parsed: rankings.length, written: saved });
      } catch (err) {
        // One bad year must not abandon the rest of the run.
        years.push({
          year,
          parsed: 0,
          written: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    sendJson(res, 200, { years, written });
  } catch (err) {
    sendError(res, err);
  }
}

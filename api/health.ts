/**
 * GET /api/health  ->  per-upstream configuration and reachability
 *
 * Exists because a missing signal is invisible. Every upstream here fails soft
 * — a source that cannot answer is simply left out of the score rather than
 * taking the page down — which is right for readers and useless for debugging.
 * "Spotify isn't in the breakdown" has at least four causes that look identical
 * from the outside: the credentials were never set, they were set on a
 * different Vercel environment than the one serving this deployment, they were
 * rejected, or Spotify was unreachable. Each needs a different fix.
 *
 * Only booleans, HTTP statuses and upstream error slugs are reported. No secret
 * or any prefix of one is ever included.
 *
 * Add ?album=... &artist=... to also trace one real lookup end to end.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from './_lib/http.js';
import { param, requireGet, sendError, sendJson } from './_lib/respond.js';
import { checkSpotifyAuth, fetchAlbumPopularity, spotifyEnabled } from './_lib/spotify.js';
import { geniusEnabled } from './_lib/genius.js';
import { redditEnabled } from './_lib/reddit.js';
import { lastfmEnabled } from './_lib/lastfm.js';
import { serviceClient } from './_lib/supabase.js';

interface Upstream {
  /** Does this source need credentials at all? */
  needsCredentials: boolean;
  /** Are they present in this deployment's environment? */
  configured: boolean;
  /** Did a live probe succeed? Null when not probed. */
  reachable: boolean | null;
  /** Why not, when it failed. */
  detail?: string;
  /** What it contributes when working. */
  contributes: string;
}

async function checkSupabase(): Promise<Upstream> {
  const db = serviceClient();
  if (!db) {
    return {
      needsCredentials: true,
      configured: false,
      reachable: null,
      detail: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing',
      contributes: 'user ratings, comments, cached catalogue, chart data',
    };
  }
  const { error } = await db.from('chart_entries').select('id', { count: 'exact', head: true });
  return {
    needsCredentials: true,
    configured: true,
    reachable: !error,
    detail: error?.message,
    contributes: 'user ratings, comments, cached catalogue, chart data',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireGet(req, res)) return;

  try {
    const spotifyAuth = await checkSpotifyAuth();
    const upstreams: Record<string, Upstream> = {
      spotify: {
        needsCredentials: true,
        configured: spotifyEnabled(),
        reachable: spotifyAuth.token !== null,
        detail: spotifyAuth.token
          ? undefined
          : [spotifyAuth.reason, spotifyAuth.status, spotifyAuth.error]
              .filter(Boolean)
              .join(' · '),
        contributes: 'track popularity — the heaviest weight in the score',
      },
      genius: {
        needsCredentials: true,
        configured: geniusEnabled(),
        reachable: null,
        detail: geniusEnabled() ? undefined : 'GENIUS_ACCESS_TOKEN missing',
        contributes: 'lyrics pageviews, and the artwork and credits in hover previews',
      },
      reddit: {
        needsCredentials: true,
        configured: redditEnabled(),
        reachable: null,
        detail: redditEnabled() ? undefined : 'REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET missing',
        contributes: 'discussion volume',
      },
      lastfm: {
        needsCredentials: true,
        configured: lastfmEnabled(),
        reachable: null,
        detail: lastfmEnabled() ? undefined : 'LASTFM_API_KEY missing',
        contributes: 'scrobble counts',
      },
      supabase: await checkSupabase(),
      deezer: {
        needsCredentials: false,
        configured: true,
        reachable: null,
        contributes: 'listener rank',
      },
      musicbrainz: {
        needsCredentials: false,
        configured: true,
        reachable: null,
        contributes: 'community ratings, where any exist',
      },
    };

    // Optional: trace one real album so a title-matching miss can be told apart
    // from an auth failure. They produce the same empty breakdown.
    const album = param(req, 'album');
    const artist = param(req, 'artist');
    let trace: unknown;
    if (album && artist) {
      const data = await fetchAlbumPopularity(artist, album).catch(() => null);
      trace = data
        ? {
            found: true,
            spotifyAlbumId: data.albumId,
            tracksWithPopularity: data.popularityByTitle.size,
            artistPopularity: data.artistPopularity,
            sample: [...data.popularityByTitle.entries()].slice(0, 5),
          }
        : {
            found: false,
            note: spotifyAuth.token
              ? 'Authenticated, but no album matched. Check the artist and album spelling.'
              : 'Not authenticated — fix the credentials first.',
          };
    }

    const missing = Object.entries(upstreams)
      .filter(([, u]) => u.needsCredentials && !u.configured)
      .map(([name]) => name);

    sendJson(
      res,
      200,
      {
        upstreams,
        missingCredentials: missing,
        ...(trace ? { trace } : {}),
      },
      // Short cache: this is a debugging aid, and each call probes Spotify.
      cacheHeaders(60),
    );
  } catch (err) {
    sendError(res, err);
  }
}

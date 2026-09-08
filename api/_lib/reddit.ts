/**
 * Reddit — https://www.reddit.com/dev/api
 *
 * How much a track is *talked about*. Streaming ranks measure passive plays;
 * Reddit discussion is a different and complementary thing, and it is where a
 * deep album cut that people latch onto shows up long before it charts.
 *
 * Only public post metadata is read (counts, scores) — never post bodies.
 *
 * Reddit requires a registered OAuth app for programmatic access, so this needs
 * REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (both free); the module no-ops
 * without them.
 *
 * Caveat worth remembering when reading the score breakdown: Reddit's search is
 * keyword-based, so a track with a common-word title will pick up unrelated
 * posts. That is why this signal carries a deliberately modest weight.
 */
import { USER_AGENT, fetchJsonOrNull } from './http.js';

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const SEARCH_URL = 'https://oauth.reddit.com/search';

interface RedditSearch {
  data?: { children?: Array<{ data?: { score?: number; num_comments?: number } }> };
}

export interface RedditTrackBuzz {
  /** Posts whose title matched the track. */
  posts: number;
  /** Combined upvotes across those posts. */
  upvotes: number;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function redditEnabled(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

/** Client-credentials token, cached for as long as Reddit says it is good for. */
async function accessToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID?.trim();
  const secret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) return null;
    cachedToken = {
      value: body.access_token,
      // Retire a minute early rather than race the expiry.
      expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
    };
    return cachedToken.value;
  } catch {
    return null;
  }
}

export async function fetchTrackBuzz(
  artist: string,
  title: string,
): Promise<RedditTrackBuzz | null> {
  const token = await accessToken();
  if (!token) return null;

  // Quote the title so the phrase must appear, and pin the artist alongside it.
  const query = `"${title.replace(/"/g, '')}" ${artist}`;
  const url =
    `${SEARCH_URL}?q=${encodeURIComponent(query)}` +
    `&limit=100&sort=top&t=all&type=link&restrict_sr=false`;

  const body = await fetchJsonOrNull<RedditSearch>(url, {
    upstream: 'reddit',
    headers: { Authorization: `Bearer ${token}` },
  });
  const children = body?.data?.children ?? [];
  if (children.length === 0) return null;

  const upvotes = children.reduce((sum, c) => sum + Math.max(0, c.data?.score ?? 0), 0);
  return { posts: children.length, upvotes };
}

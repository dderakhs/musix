/**
 * Genius — https://docs.genius.com
 *
 * Genius publishes a per-song `pageviews` counter, which is the single best
 * openly available measure of how much *attention* a specific track is getting:
 * people look up a song's lyrics in rough proportion to how much they are
 * listening to and talking about it, and unlike streaming ranks it is not
 * diluted across an artist's back catalogue.
 *
 * Only the song's metadata and view counter are read. Lyrics themselves are
 * licensed content and are never fetched or stored.
 *
 * Needs a free access token (GENIUS_ACCESS_TOKEN); the module no-ops without one.
 */
import { fetchJsonOrNull, normaliseTitle } from './http.js';

const BASE = 'https://api.genius.com';

interface GeniusSearch {
  response?: {
    hits?: Array<{
      result?: {
        id?: number;
        title?: string;
        primary_artist?: { name?: string };
      };
    }>;
  };
}

interface GeniusSong {
  response?: { song?: { stats?: { pageviews?: number } } };
}

export interface GeniusTrackStats {
  songId: number;
  pageviews: number | null;
}

export function geniusEnabled(): boolean {
  return Boolean(process.env.GENIUS_ACCESS_TOKEN);
}

function authHeaders(): Record<string, string> | null {
  const token = process.env.GENIUS_ACCESS_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/**
 * Pageviews for one track. Two calls: search (which does not carry stats), then
 * the song endpoint (which does).
 */
export async function fetchTrackStats(
  artist: string,
  title: string,
): Promise<GeniusTrackStats | null> {
  const headers = authHeaders();
  if (!headers) return null;

  const query = `${artist} ${title}`;
  const search = await fetchJsonOrNull<GeniusSearch>(
    `${BASE}/search?q=${encodeURIComponent(query)}`,
    { upstream: 'genius', headers },
  );

  const hits = search?.response?.hits ?? [];
  if (hits.length === 0) return null;

  // Genius search is fuzzy and will happily return a remix, a live cut or an
  // entirely different song. Require the title to actually match before
  // trusting the number attached to it.
  const wantedTitle = normaliseTitle(title);
  const wantedArtist = normaliseTitle(artist);
  const match =
    hits.find((h) => {
      const t = normaliseTitle(h.result?.title ?? '');
      const a = normaliseTitle(h.result?.primary_artist?.name ?? '');
      return t === wantedTitle && (a === wantedArtist || a.includes(wantedArtist));
    }) ?? hits.find((h) => normaliseTitle(h.result?.title ?? '') === wantedTitle);

  const songId = match?.result?.id;
  if (typeof songId !== 'number') return null;

  const song = await fetchJsonOrNull<GeniusSong>(
    `${BASE}/songs/${songId}?text_format=plain`,
    { upstream: 'genius', headers },
  );
  const pageviews = song?.response?.song?.stats?.pageviews;

  return {
    songId,
    pageviews: typeof pageviews === 'number' && pageviews > 0 ? pageviews : null,
  };
}

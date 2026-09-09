/**
 * Spotify Web API — https://developer.spotify.com/documentation/web-api
 *
 * The best free measure of how big a song is. Every track carries a
 * `popularity` from 0-100 that Spotify computes across its whole catalogue, so
 * unlike a raw play rank it is already normalised and directly comparable
 * between artists and eras.
 *
 * It is also cheap in a way nothing else here is. One album needs a search, a
 * tracklist, and one batched lookup — about four calls for a whole record,
 * where Genius needs two per track.
 *
 * Client-credentials auth, so it reads public catalogue data only and never
 * touches a user's account. Needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET;
 * the module no-ops without them.
 */
import { fetchJsonOrNull, normaliseTitle } from './http.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

interface SpotifySearch {
  albums?: { items?: Array<{ id: string; name: string; artists?: Array<{ id: string; name: string }> }> };
}
interface SpotifyAlbumTracks {
  items?: Array<{ id: string; name: string; track_number?: number }>;
}
interface SpotifyTracks {
  tracks?: Array<{ id: string; name: string; popularity?: number } | null>;
}
interface SpotifyArtist {
  popularity?: number;
}

export interface SpotifyAlbumData {
  albumId: string;
  /** Track popularity 0-100, keyed by normalised title. */
  popularityByTitle: Map<string, number>;
  /** The album artist's own popularity 0-100, for catalogue context. */
  artistPopularity: number | null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function spotifyEnabled(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

/**
 * Why a token request failed, for the health endpoint.
 *
 * A silent null is right for the album path — a missing signal must never fail
 * a page — but it is useless when you are trying to work out why Spotify is
 * not contributing. Credentials absent, credentials rejected, and Spotify
 * being unreachable all look identical from the outside and need different
 * fixes, so the reason is recorded here rather than thrown away.
 *
 * Spotify's own error slug ("invalid_client") is safe to surface: it describes
 * the request, not the secret.
 */
export interface SpotifyTokenResult {
  token: string | null;
  reason: 'ok' | 'cached' | 'not_configured' | 'rejected' | 'no_token_in_body' | 'unreachable';
  status?: number;
  error?: string;
}

async function requestToken(): Promise<SpotifyTokenResult> {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) return { token: null, reason: 'not_configured' };
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return { token: cachedToken.value, reason: 'cached' };
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { token: null, reason: 'rejected', status: res.status, error: body?.error };
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) return { token: null, reason: 'no_token_in_body', status: res.status };
    cachedToken = {
      value: body.access_token,
      // Retire a minute early rather than race the expiry mid-request.
      expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
    };
    return { token: cachedToken.value, reason: 'ok', status: res.status };
  } catch (err) {
    return {
      token: null,
      reason: 'unreachable',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** The token, or null — the album path's view, where a failure is just absence. */
async function accessToken(): Promise<string | null> {
  return (await requestToken()).token;
}

/** Probe the credentials without using them, for /api/health. */
export async function checkSpotifyAuth(): Promise<SpotifyTokenResult> {
  return requestToken();
}

/**
 * Find the album, tolerating how the two catalogues write a title.
 *
 * Spotify's field filters are exact and unforgiving, and iTunes rarely hands
 * over a bare title — it appends "- Single", "(Deluxe)", a year, an edition.
 * `album:"ICEMAN (Deluxe)"` then matches nothing at all, which is
 * indistinguishable from the record not existing. So the filtered query is
 * tried first for precision, then progressively looser ones, and the artist is
 * checked on the result rather than trusting whatever came back first.
 */
async function findAlbum(
  artist: string,
  album: string,
  headers: Record<string, string>,
): Promise<{ id: string; name: string; artists?: Array<{ id: string; name: string }> } | null> {
  const cleanAlbum = album.replace(/"/g, '');
  const cleanArtist = artist.replace(/"/g, '');
  const bare = normaliseTitle(album);
  const wantedArtist = normaliseTitle(artist);

  const queries = [
    `album:"${cleanAlbum}" artist:"${cleanArtist}"`,
    // Same filters, but on the title stripped of editions and qualifiers.
    ...(bare && bare !== normaliseTitle(cleanAlbum) ? [`album:"${bare}" artist:"${cleanArtist}"`] : []),
    // No filters at all: Spotify's relevance ranking is good, and the artist
    // check below is what keeps this honest.
    `${cleanAlbum} ${cleanArtist}`,
  ];

  for (const query of queries) {
    const search = await fetchJsonOrNull<SpotifySearch>(
      `${API}/search?q=${encodeURIComponent(query)}&type=album&limit=10`,
      { upstream: 'spotify', headers },
    );
    const candidates = search?.albums?.items ?? [];
    if (candidates.length === 0) continue;

    // Only ever accept an album by the artist asked for. Without this the
    // unfiltered query would happily return a covers record or a mixtape that
    // merely shares the title.
    const byArtist = candidates.filter((a) =>
      (a.artists ?? []).some((x) => {
        const name = normaliseTitle(x.name);
        return name === wantedArtist || name.includes(wantedArtist) || wantedArtist.includes(name);
      }),
    );
    if (byArtist.length === 0) continue;

    const exact = byArtist.find((a) => normaliseTitle(a.name) === bare);
    if (exact) return exact;
    // A title that merely starts the same is usually an edition of the record.
    const partial = byArtist.find(
      (a) => normaliseTitle(a.name).startsWith(bare) || bare.startsWith(normaliseTitle(a.name)),
    );
    if (partial) return partial;
    if (query.startsWith('album:')) return byArtist[0];
  }
  return null;
}

/** Popularity for every track on a record, in about four requests. */
export async function fetchAlbumPopularity(
  artist: string,
  album: string,
): Promise<SpotifyAlbumData | null> {
  const token = await accessToken();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };

  const match = await findAlbum(artist, album, headers);
  if (!match) return null;

  const listing = await fetchJsonOrNull<SpotifyAlbumTracks>(
    `${API}/albums/${match.id}/tracks?limit=50`,
    { upstream: 'spotify', headers },
  );
  const ids = (listing?.items ?? []).map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return null;

  // The album tracklist endpoint returns simplified objects with no popularity,
  // so the ids are re-read in bulk. Fifty per request is the API's ceiling.
  const popularityByTitle = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = await fetchJsonOrNull<SpotifyTracks>(
      `${API}/tracks?ids=${ids.slice(i, i + 50).join(',')}`,
      { upstream: 'spotify', headers },
    );
    for (const t of batch?.tracks ?? []) {
      if (!t || typeof t.popularity !== 'number') continue;
      const key = normaliseTitle(t.name);
      popularityByTitle.set(key, Math.max(popularityByTitle.get(key) ?? 0, t.popularity));
    }
  }

  const artistId = match.artists?.[0]?.id;
  const artistPopularity = artistId
    ? ((await fetchJsonOrNull<SpotifyArtist>(`${API}/artists/${artistId}`, {
        upstream: 'spotify',
        headers,
      }))?.popularity ?? null)
    : null;

  return { albumId: match.id, popularityByTitle, artistPopularity };
}

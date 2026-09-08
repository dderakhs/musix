/**
 * Last.fm — https://www.last.fm/api
 *
 * Optional. Unlike the other upstreams this one needs a (free) API key, so the
 * whole module no-ops unless LASTFM_API_KEY is set. When it is available it adds
 * scrobble-derived listener counts, which are the broadest public signal of how
 * widely a track is actually listened to.
 */
import { fetchJsonOrNull, normaliseTitle } from './http.js';

const BASE = 'https://ws.audioscrobbler.com/2.0';

interface LastfmAlbumInfo {
  album?: {
    listeners?: string;
    playcount?: string;
    tracks?: { track?: Array<{ name: string; playcount?: string; listeners?: string }> };
  };
}

export interface LastfmAlbumData {
  albumListeners: number | null;
  /** Per-track listener counts keyed by normalised title. */
  listenersByTitle: Map<string, number>;
}

export function lastfmEnabled(): boolean {
  return Boolean(process.env.LASTFM_API_KEY);
}

export async function fetchAlbumListeners(
  artist: string,
  album: string,
): Promise<LastfmAlbumData | null> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return null;

  const url =
    `${BASE}/?method=album.getinfo&api_key=${key}&format=json` +
    `&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`;
  const data = await fetchJsonOrNull<LastfmAlbumInfo>(url, { upstream: 'lastfm' });
  if (!data?.album) return null;

  const listenersByTitle = new Map<string, number>();
  for (const t of data.album.tracks?.track ?? []) {
    // album.getinfo returns playcount per track but not listeners; playcount is
    // the usable per-track figure.
    const plays = Number(t.playcount ?? t.listeners ?? 0);
    if (!Number.isFinite(plays) || plays <= 0) continue;
    listenersByTitle.set(normaliseTitle(t.name), plays);
  }
  const albumListeners = Number(data.album.listeners ?? 0);
  return {
    albumListeners: Number.isFinite(albumListeners) && albumListeners > 0 ? albumListeners : null,
    listenersByTitle,
  };
}

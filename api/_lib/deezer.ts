/**
 * Deezer public API — https://developers.deezer.com/api
 *
 * Keyless. Every track carries a `rank` (roughly 0-1,000,000) that reflects how
 * much the world actually plays it, and every album carries a `fans` count.
 * Together they stand in for the "how well received is this track" half of the
 * public score, where MusicBrainz has no votes.
 */
import { fetchJsonOrNull, normaliseTitle } from './http.js';

const BASE = 'https://api.deezer.com';

interface DeezerSearchAlbums {
  data?: Array<{ id: number; title: string; artist?: { name: string }; nb_tracks?: number }>;
}

interface DeezerAlbum {
  id: number;
  title: string;
  fans?: number;
  nb_tracks?: number;
}

interface DeezerAlbumTracks {
  data?: Array<{ id: number; title: string; rank?: number; duration?: number }>;
}

export interface DeezerAlbumData {
  albumId: number;
  fans: number | null;
  /** Track popularity rank keyed by normalised title. */
  rankByTitle: Map<string, number>;
}

export async function findAlbum(artist: string, album: string): Promise<number | null> {
  const q = `artist:"${artist.replace(/"/g, '')}" album:"${album.replace(/"/g, '')}"`;
  const url = `${BASE}/search/album?q=${encodeURIComponent(q)}&limit=5`;
  const data = await fetchJsonOrNull<DeezerSearchAlbums>(url, { upstream: 'deezer' });
  const hits = data?.data ?? [];
  if (hits.length === 0) return null;
  const wanted = normaliseTitle(album);
  const exact = hits.find((a) => normaliseTitle(a.title) === wanted);
  return (exact ?? hits[0]).id;
}

export async function fetchAlbumPopularity(albumId: number): Promise<DeezerAlbumData | null> {
  const [album, tracks] = await Promise.all([
    fetchJsonOrNull<DeezerAlbum>(`${BASE}/album/${albumId}`, { upstream: 'deezer' }),
    fetchJsonOrNull<DeezerAlbumTracks>(`${BASE}/album/${albumId}/tracks?limit=200`, {
      upstream: 'deezer',
    }),
  ]);
  if (!album && !tracks) return null;

  const rankByTitle = new Map<string, number>();
  for (const t of tracks?.data ?? []) {
    if (typeof t.rank !== 'number') continue;
    const key = normaliseTitle(t.title);
    rankByTitle.set(key, Math.max(rankByTitle.get(key) ?? 0, t.rank));
  }
  return { albumId, fans: album?.fans ?? null, rankByTitle };
}

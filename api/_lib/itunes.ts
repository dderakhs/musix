/**
 * iTunes Search API — https://performance-partners.apple.com/search-api
 *
 * Keyless and CORS-friendly, and the best free source of album artwork plus
 * complete, correctly ordered track listings (disc + track numbers, previews).
 * It is the spine of the catalogue; MusicBrainz and Deezer enrich it.
 */
import { fetchJson, cacheHeaders } from './http';

const BASE = 'https://itunes.apple.com';

export interface ItunesArtist {
  wrapperType: 'artist';
  artistId: number;
  artistName: string;
  primaryGenreName?: string;
  artistLinkUrl?: string;
}

export interface ItunesAlbum {
  wrapperType: 'collection';
  collectionType?: string;
  collectionId: number;
  collectionName: string;
  artistId?: number;
  artistName: string;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
}

export interface ItunesTrack {
  wrapperType: 'track';
  kind?: string;
  trackId: number;
  trackName: string;
  collectionId: number;
  artistName: string;
  discNumber?: number;
  trackNumber?: number;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackExplicitness?: string;
  artworkUrl100?: string;
}

type ItunesResponse<T> = { resultCount: number; results: T[] };

/** iTunes serves art at any square size; ask for something retina-sized. */
export function artworkAt(artworkUrl100: string | undefined, size: number): string | null {
  if (!artworkUrl100) return null;
  return artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`);
}

/**
 * iTunes labels anything short an EP/single. Track count is the more reliable
 * signal, since `collectionType` is often just "Album".
 */
export function classifyAlbum(album: ItunesAlbum): 'album' | 'ep' | 'single' | 'compilation' {
  const name = album.collectionName.toLowerCase();
  if (album.collectionType === 'Compilation' || /\bgreatest hits\b|\banthology\b/.test(name)) {
    return 'compilation';
  }
  if (/ - single$|\bsingle\b/.test(name) || (album.trackCount ?? 0) <= 2) return 'single';
  if (/ - ep$|\bep\b/.test(name) || (album.trackCount ?? 0) <= 6) return 'ep';
  return 'album';
}

export async function searchArtists(term: string, limit = 8): Promise<ItunesArtist[]> {
  const url = `${BASE}/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=${limit}`;
  const data = await fetchJson<ItunesResponse<ItunesArtist>>(url, { upstream: 'itunes' });
  return data.results.filter((r) => r.wrapperType === 'artist');
}

export async function searchAlbums(term: string, limit = 12): Promise<ItunesAlbum[]> {
  const url = `${BASE}/search?term=${encodeURIComponent(term)}&entity=album&limit=${limit}`;
  const data = await fetchJson<ItunesResponse<ItunesAlbum>>(url, { upstream: 'itunes' });
  return data.results.filter((r) => r.wrapperType === 'collection');
}

/** Artist header plus every album iTunes knows about, newest first. */
export async function lookupArtistDiscography(
  artistId: number,
): Promise<{ artist: ItunesArtist | null; albums: ItunesAlbum[] }> {
  const url = `${BASE}/lookup?id=${artistId}&entity=album&limit=200`;
  const data = await fetchJson<ItunesResponse<ItunesArtist | ItunesAlbum>>(url, {
    upstream: 'itunes',
  });
  const artist = (data.results.find((r) => r.wrapperType === 'artist') as ItunesArtist) ?? null;
  const albums = data.results.filter((r): r is ItunesAlbum => r.wrapperType === 'collection');
  return { artist, albums };
}

/** Album header plus its full, ordered track listing. */
export async function lookupAlbumTracks(
  collectionId: number,
): Promise<{ album: ItunesAlbum | null; tracks: ItunesTrack[] }> {
  const url = `${BASE}/lookup?id=${collectionId}&entity=song&limit=300`;
  const data = await fetchJson<ItunesResponse<ItunesAlbum | ItunesTrack>>(url, {
    upstream: 'itunes',
  });
  const album = (data.results.find((r) => r.wrapperType === 'collection') as ItunesAlbum) ?? null;
  const tracks = data.results
    .filter((r): r is ItunesTrack => r.wrapperType === 'track' && r.kind === 'song')
    .sort(
      (a, b) =>
        (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
    );
  return { album, tracks };
}

export const ITUNES_CACHE = cacheHeaders(60 * 60 * 24);

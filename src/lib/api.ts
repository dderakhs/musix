import type { AlbumResponse, ArtistResponse, SearchResponse } from './types';

class ApiError extends Error {
  // Written out longhand rather than as a parameter property: the app tsconfig
  // sets `erasableSyntaxOnly`, which rules that syntax out.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body; keep the status message */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const searchCatalogue = (q: string, signal?: AbortSignal) =>
  get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, signal);

export const fetchArtist = (id: string | number, signal?: AbortSignal) =>
  get<ArtistResponse>(`/api/artist/${encodeURIComponent(String(id))}`, signal);

export const fetchAlbum = (id: string | number, signal?: AbortSignal) =>
  get<AlbumResponse>(`/api/album/${encodeURIComponent(String(id))}`, signal);

export { ApiError };

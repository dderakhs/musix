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

/**
 * Pull a human-readable message out of an error body without ever stringifying
 * an object. Our own functions answer `{ error: "..." }`, but a platform-level
 * failure (a function that could not boot, say) answers Vercel's shape,
 * `{ error: { code, message } }` — blindly assigning that to a string is what
 * turns a real failure into a useless "[object Object]" on screen.
 */
function errorMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error === 'string' && error) return error;
  if (typeof error === 'object' && error !== null) {
    const { message: nested, code } = error as { message?: unknown; code?: unknown };
    if (typeof nested === 'string' && nested) return nested;
    if (typeof code === 'string' && code) return code;
  }
  if (typeof message === 'string' && message) return message;
  return fallback;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  const fallback = `Request failed (${res.status})`;

  if (!res.ok) {
    let message = fallback;
    try {
      message = errorMessage(await res.json(), fallback);
    } catch {
      /* non-JSON error body; keep the status message */
    }
    throw new ApiError(res.status, message);
  }

  // A 200 that is not JSON means the request fell through to the SPA shell
  // rather than reaching a function — worth saying plainly.
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, `${path} did not return JSON — the API route may not be deployed.`);
  }
}

export const searchCatalogue = (q: string, signal?: AbortSignal) =>
  get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, signal);

export const fetchArtist = (id: string | number, signal?: AbortSignal) =>
  get<ArtistResponse>(`/api/artist/${encodeURIComponent(String(id))}`, signal);

export const fetchAlbum = (id: string | number, signal?: AbortSignal) =>
  get<AlbumResponse>(`/api/album/${encodeURIComponent(String(id))}`, signal);

export { ApiError };

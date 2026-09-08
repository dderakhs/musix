/**
 * Small fetch helpers shared by the public-music-API clients.
 *
 * Every upstream here is a free, keyless, publicly documented API. They are all
 * rate limited to some degree, so callers should lean on the response caching in
 * `cacheHeaders` and on the catalogue tables in Supabase rather than re-fetching.
 */

export const USER_AGENT =
  `musix/1.0 ( ${process.env.MUSICBRAINZ_APP_CONTACT ?? 'https://github.com/dderakhs/musix'} )`;

export class UpstreamError extends Error {
  constructor(
    readonly upstream: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** Fetch JSON with a hard timeout. Throws `UpstreamError` on a non-2xx. */
export async function fetchJson<T>(
  url: string,
  opts: { upstream: string; timeoutMs?: number; headers?: Record<string, string> },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...opts.headers },
    });
    if (!res.ok) {
      throw new UpstreamError(opts.upstream, res.status, `${opts.upstream} responded ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new UpstreamError(opts.upstream, 502, `${opts.upstream} request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same as `fetchJson` but resolves to `null` instead of throwing. Used for the
 * enrichment sources, which are all optional: a track still renders with a
 * partial score if one upstream is down.
 */
export async function fetchJsonOrNull<T>(
  url: string,
  opts: { upstream: string; timeoutMs?: number; headers?: Record<string, string> },
): Promise<T | null> {
  try {
    return await fetchJson<T>(url, opts);
  } catch {
    return null;
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Catalogue data changes rarely, so let the Vercel edge cache absorb most of the
 * traffic and keep us well inside the upstream rate limits.
 */
export function cacheHeaders(seconds: number): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 7}`,
  };
}

/** Normalised title used to match a track across iTunes, MusicBrainz and Deezer. */
export function normaliseTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/feat\.?.*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

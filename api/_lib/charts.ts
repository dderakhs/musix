/**
 * Apple's official "Most Played" chart feed.
 *
 * A note on Billboard: it has no public API, and its charts are licensed data
 * that its terms do not permit scraping. Apple's RSS Marketing Tools feed is
 * free, keyless, officially published for this purpose, and measures the same
 * thing — what people are actually playing right now — so that is what the
 * popular rail uses.
 */
import { fetchJson } from './http.js';

const FEED = (storefront: string, limit: number, kind: 'songs' | 'albums') =>
  `https://rss.applemarketingtools.com/api/v2/${storefront}/music/most-played/${limit}/${kind}.json`;

interface AppleFeed {
  feed?: {
    title?: string;
    results?: Array<{
      id?: string;
      name?: string;
      artistName?: string;
      artworkUrl100?: string;
      url?: string;
      releaseDate?: string;
    }>;
  };
}

export interface ChartEntry {
  rank: number;
  /** Track id for a song chart, collection id for an album chart. */
  itunesTrackId: number | null;
  itunesCollectionId: number | null;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  releaseDate: string | null;
}

export async function fetchTopSongs(limit = 100, storefront = 'us'): Promise<ChartEntry[]> {
  return fetchChart('songs', limit, storefront);
}

export async function fetchTopAlbums(limit = 100, storefront = 'us'): Promise<ChartEntry[]> {
  return fetchChart('albums', limit, storefront);
}

async function fetchChart(
  kind: 'songs' | 'albums',
  limit: number,
  storefront: string,
): Promise<ChartEntry[]> {
  const data = await fetchJson<AppleFeed>(FEED(storefront, limit, kind), {
    upstream: 'apple-charts',
  });
  const results = data.feed?.results ?? [];

  return results.flatMap((entry, index) => {
    if (!entry.name || !entry.artistName) return [];
    const id = Number(entry.id);
    const numeric = Number.isFinite(id) ? id : null;
    return [
      {
        rank: index + 1,
        itunesTrackId: kind === 'songs' ? numeric : null,
        itunesCollectionId: kind === 'albums' ? numeric : null,
        title: entry.name,
        artistName: entry.artistName,
        // The feed ships 100px art; ask for something retina-sized.
        artworkUrl: entry.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/400x400bb.') ?? null,
        releaseDate: entry.releaseDate ?? null,
      },
    ];
  });
}

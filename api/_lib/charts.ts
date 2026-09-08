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

const FEED = (storefront: string, limit: number) =>
  `https://rss.applemarketingtools.com/api/v2/${storefront}/music/most-played/${limit}/songs.json`;

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
  itunesTrackId: number | null;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  releaseDate: string | null;
}

export async function fetchTopSongs(limit = 100, storefront = 'us'): Promise<ChartEntry[]> {
  const data = await fetchJson<AppleFeed>(FEED(storefront, limit), { upstream: 'apple-charts' });
  const results = data.feed?.results ?? [];

  return results.flatMap((entry, index) => {
    if (!entry.name || !entry.artistName) return [];
    const id = Number(entry.id);
    return [
      {
        rank: index + 1,
        itunesTrackId: Number.isFinite(id) ? id : null,
        title: entry.name,
        artistName: entry.artistName,
        // The feed ships 100px art; ask for something retina-sized.
        artworkUrl: entry.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/400x400bb.') ?? null,
        releaseDate: entry.releaseDate ?? null,
      },
    ];
  });
}

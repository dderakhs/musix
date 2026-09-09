/**
 * Persistence and lookup for year-end chart placings.
 *
 * Matching chart rows to catalogue tracks is the hard part. The chart writes
 * "THRIFT SHOP by Macklemore and Ryan Lewis featuring Wanz"; iTunes calls the
 * same record "Thrift Shop (feat. Wanz)" by "Macklemore & Ryan Lewis". So both
 * sides are reduced to the same compact keys the search ranker uses, credited
 * guests are dropped from the artist, and parenthetical qualifiers are dropped
 * from the title before comparison.
 */
import { compactKey, tokens } from './match.js';
import { serviceClient } from './supabase.js';
import type { ChartRanking } from './top40.js';

/** Guest credits are formatted a dozen ways and are never part of the match. */
const GUEST = /\s+(?:feat(?:uring)?\.?|ft\.?|with|x|vs\.?)\s+.*$/i;

/** Trailing qualifiers: "(feat. Wanz)", "[Radio Edit]", "- Remastered". */
const QUALIFIER = /\s*[([].*?[)\]]\s*|\s+-\s+.*$/g;

export function titleKeyOf(title: string): string {
  return compactKey(title.replace(QUALIFIER, ' ').replace(GUEST, ''));
}

export function artistKeyOf(artist: string): string {
  return compactKey(artist.replace(GUEST, ''));
}

/** Words shared by nearly every credit, which carry no identifying weight. */
const FILLER = new Set(['and', 'the', 'a', 'of', 'x']);

/** Ordered, because which name comes first is what identifies the lead act. */
function artistTokens(artist: string): string[] {
  return tokens(artist.replace(GUEST, '')).filter((t) => !FILLER.has(t));
}

/**
 * Two credits name the same act when one's words are all present in the other.
 *
 * Subset rather than substring: the credits differ by guests and connectors, so
 * "Post Malone" has to match "Post Malone & 21 Savage" and "Macklemore & Ryan
 * Lewis" has to match "Macklemore and Ryan Lewis". But a raw substring test on
 * the compact keys would also match "Ye" against "Kanye West", and any short
 * name against any longer one that happens to contain its letters — which on a
 * title collision like "Baby" or "Stay" would credit the wrong artist with
 * someone else's chart placing.
 */
function sameArtist(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];

  // A lone word is the weakest possible evidence, so it has to be the *lead*
  // name rather than merely present. That keeps "Drake" against "Drake &
  // Future" while refusing "Sean" against "Jay Sean featuring Lil Wayne" —
  // which, on a title as common as "Down", would otherwise hand a solo act
  // someone else's chart placing.
  if (small.length === 1) return small[0] === large[0];

  const haystack = new Set(large);
  return small.every((token) => haystack.has(token));
}

export interface ChartPeak {
  year: number;
  rank: number;
}

/** Write a batch of rankings, replacing any existing rows for the same slots. */
export async function saveRankings(rankings: ChartRanking[], source = 'top40weekly'): Promise<number> {
  const db = serviceClient();
  if (!db || rankings.length === 0) return 0;

  const rows = rankings.map((r) => ({
    source,
    chart: 'year_end_singles',
    year: r.year,
    rank: r.rank,
    title: r.title,
    artist: r.artist,
    title_key: titleKeyOf(r.title),
    artist_key: artistKeyOf(r.artist),
    fetched_at: new Date().toISOString(),
  }));

  // Chunked so a decade page (1000 rows) does not go up as one giant statement.
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db
      .from('chart_entries')
      .upsert(chunk, { onConflict: 'source,chart,year,rank' });
    if (error) throw new Error(`chart_entries upsert failed: ${error.message}`);
    written += chunk.length;
  }
  return written;
}

/**
 * Best placing for each of the given tracks, keyed by the track's own title.
 *
 * One query for the whole album: the title keys go up together and the artist
 * check happens here, because an artist match is a judgement the database
 * cannot make with an equality test.
 */
export async function lookupPeaks(
  tracks: Array<{ title: string; artist: string }>,
): Promise<Map<string, ChartPeak>> {
  const peaks = new Map<string, ChartPeak>();
  const db = serviceClient();
  if (!db || tracks.length === 0) return peaks;

  const keys = [...new Set(tracks.map((t) => titleKeyOf(t.title)).filter(Boolean))];
  if (keys.length === 0) return peaks;

  const { data, error } = await db
    .from('chart_entries')
    .select('year, rank, title_key, artist')
    .in('title_key', keys);
  // A missing chart table or a failed lookup must not take the album down with
  // it: no placing simply means no placing.
  if (error || !data) return peaks;

  for (const track of tracks) {
    const titleKey = titleKeyOf(track.title);
    const artistToks = artistTokens(track.artist);
    let best: ChartPeak | null = null;
    for (const row of data) {
      if (row.title_key !== titleKey) continue;
      if (!sameArtist(artistToks, artistTokens(row.artist as string))) continue;
      if (!best || (row.rank as number) < best.rank) {
        best = { year: row.year as number, rank: row.rank as number };
      }
    }
    if (best) peaks.set(track.title, best);
  }
  return peaks;
}

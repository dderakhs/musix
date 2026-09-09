/**
 * Year-end chart rankings from top40weekly.com.
 *
 * Read through the site's WordPress REST API rather than by scraping the
 * rendered page: `/wp-json/wp/v2/pages?slug=…` returns the same content as
 * clean JSON, without the ad and analytics markup that makes the HTML page
 * fragile to parse and expensive to fetch.
 *
 * Only the rankings are taken — position, title, artist. Those are facts about
 * what charted, not the site's own writing, and none of its editorial prose is
 * copied or stored.
 *
 * Why this matters to the score: a year-end chart placing is *historical* and
 * does not decay. Every streaming signal measures current listening and so reads
 * an older record as a worse one; a 2013 chart position is as true now as it was
 * then, which is exactly the correction the model was missing.
 */
import { fetchJson } from './http.js';

const API = 'https://top40weekly.com/wp-json/wp/v2/pages';

export interface ChartRanking {
  year: number;
  rank: number;
  title: string;
  artist: string;
}

interface WpPage {
  slug?: string;
  content?: { rendered?: string };
}

/** Year-end singles pages, by the era they cover. */
export function yearSlug(year: number): string {
  if (year >= 2024) return `top-songs-of-${year}`;
  if (year >= 2020) return `all-us-top-40-singles-for-${year}`;
  return `${year}-all-charts`;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#038': '&', '#039': "'", '#8217': '’', '#8216': '‘',
  '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—',
};

function decode(value: string): string {
  return value.replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole);
}

/** Strip the keyword links the site wraps around artist names, keeping the text. */
function textOf(html: string): string {
  return decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Entries read "TITLE by ARTIST". Split on the *last* lowercase " by ", so a
 * title that contains the word itself — "Stand By Me by Ben E. King" — still
 * divides in the right place.
 */
export function splitEntry(text: string): { title: string; artist: string } | null {
  const matches = [...text.matchAll(/ by /g)];
  if (matches.length === 0) return null;
  const at = matches[matches.length - 1].index ?? -1;
  if (at <= 0) return null;
  const title = text.slice(0, at).trim();
  const artist = text.slice(at + 4).trim();
  return title && artist ? { title, artist } : null;
}

/**
 * Pull every ranked list out of a page.
 *
 * A decade page carries one list per year, each introduced by an
 * `<h2 id="2013-topsongslist">`; a single-year page carries one list and takes
 * its year from the caller.
 */
export function parseRankings(html: string, fallbackYear?: number): ChartRanking[] {
  const rankings: ChartRanking[] = [];
  // Walk headings and lists in document order so each list is attributed to the
  // year heading that precedes it.
  // The leading \s is load-bearing: the page's own table of contents links
  // each year as <a ... data-id="2013-topsongslist">, and a bare `id="` would
  // match that substring. The TOC sits above the content, so a match there
  // would attribute the first list to the last year linked.
  const blocks = [...html.matchAll(/<h2[^>]*\sid="(\d{4})-topsongslist"[^>]*>|<ol[^>]*>([\s\S]*?)<\/ol>/gi)];

  let year = fallbackYear;
  for (const block of blocks) {
    const heading = block[1];
    if (heading) {
      year = Number(heading);
      continue;
    }
    const list = block[2];
    if (!list || year === undefined) continue;

    let rank = 0;
    for (const item of list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const parsed = splitEntry(textOf(item[1]));
      rank += 1;
      if (parsed) rankings.push({ year, rank, title: parsed.title, artist: parsed.artist });
    }
  }
  return rankings;
}

/** Fetch and parse one page by slug. */
export async function fetchChartPage(
  slug: string,
  fallbackYear?: number,
): Promise<ChartRanking[]> {
  const url = `${API}?slug=${encodeURIComponent(slug)}&_fields=slug,content`;
  const pages = await fetchJson<WpPage[]>(url, { upstream: 'top40weekly', timeoutMs: 15000 });
  const html = pages?.[0]?.content?.rendered;
  if (!html) return [];
  return parseRankings(html, fallbackYear);
}

export const fetchYear = (year: number) => fetchChartPage(yearSlug(year), year);

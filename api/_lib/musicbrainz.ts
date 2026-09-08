/**
 * MusicBrainz web service — https://musicbrainz.org/doc/MusicBrainz_API
 *
 * The one free, keyless source of genuine *community review scores*: releases,
 * release groups and recordings all carry a 0-5 star rating with a vote count.
 * Coverage is patchy outside well-known releases, which is why the public score
 * blends it with popularity signals rather than relying on it alone.
 *
 * The service asks for max 1 request/second and a descriptive User-Agent; both
 * are honoured here (`http.ts` sets the UA, `sleep` paces the calls).
 */
import { fetchJsonOrNull, normaliseTitle, sleep } from './http';

const BASE = 'https://musicbrainz.org/ws/2';
const THROTTLE_MS = 1100;

export interface MbRating {
  value: number | null;
  'votes-count': number;
}

interface MbReleaseGroupSearch {
  'release-groups'?: Array<{
    id: string;
    title: string;
    score?: number;
    'primary-type'?: string;
    'artist-credit'?: Array<{ name: string; artist?: { id: string; name: string } }>;
  }>;
}

interface MbReleaseGroupLookup {
  id: string;
  title: string;
  rating?: MbRating;
}

interface MbReleaseBrowse {
  releases?: Array<{ id: string; title: string; 'track-count'?: number; date?: string }>;
}

interface MbRecordingBrowse {
  recordings?: Array<{ id: string; title: string; length?: number; rating?: MbRating }>;
}

/** Community rating for one recording, keyed by normalised track title. */
export interface MbTrackRatings {
  releaseGroupId: string | null;
  releaseGroupRating: MbRating | null;
  byTitle: Map<string, MbRating>;
}

let lastCall = 0;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const wait = THROTTLE_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  return fn();
}

/** Best-matching release group MBID for an artist/album pair, or null. */
export async function findReleaseGroup(
  artist: string,
  album: string,
): Promise<string | null> {
  const query = `releasegroup:"${album.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`;
  const url = `${BASE}/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
  const data = await throttled(() =>
    fetchJsonOrNull<MbReleaseGroupSearch>(url, { upstream: 'musicbrainz' }),
  );
  const groups = data?.['release-groups'] ?? [];
  if (groups.length === 0) return null;

  // The Lucene score is a decent proxy, but confirm the title actually matches
  // so a fuzzy hit on a different record does not poison the score.
  const wanted = normaliseTitle(album);
  const exact = groups.find((g) => normaliseTitle(g.title) === wanted);
  return (exact ?? groups[0]).id;
}

/**
 * Community ratings for every recording on a release group, in as few requests
 * as the API allows: pick a representative release, then browse its recordings
 * with `inc=ratings` (one call covers the whole tracklist).
 */
export async function fetchAlbumRatings(
  releaseGroupId: string,
): Promise<MbTrackRatings> {
  const empty: MbTrackRatings = {
    releaseGroupId,
    releaseGroupRating: null,
    byTitle: new Map(),
  };

  const rgUrl = `${BASE}/release-group/${releaseGroupId}?inc=ratings&fmt=json`;
  const rg = await throttled(() =>
    fetchJsonOrNull<MbReleaseGroupLookup>(rgUrl, { upstream: 'musicbrainz' }),
  );
  if (rg?.rating && rg.rating.value != null) empty.releaseGroupRating = rg.rating;

  const relUrl = `${BASE}/release?release-group=${releaseGroupId}&fmt=json&limit=25`;
  const rels = await throttled(() =>
    fetchJsonOrNull<MbReleaseBrowse>(relUrl, { upstream: 'musicbrainz' }),
  );
  const releases = rels?.releases ?? [];
  if (releases.length === 0) return empty;

  // Prefer the fullest release: reissues and deluxe editions carry the most
  // recordings, which maximises how many tracks we can match.
  const release = releases.reduce((best, r) =>
    (r['track-count'] ?? 0) > (best['track-count'] ?? 0) ? r : best,
  );

  const recUrl = `${BASE}/recording?release=${release.id}&inc=ratings&fmt=json&limit=100`;
  const recs = await throttled(() =>
    fetchJsonOrNull<MbRecordingBrowse>(recUrl, { upstream: 'musicbrainz' }),
  );
  for (const rec of recs?.recordings ?? []) {
    if (!rec.rating || rec.rating.value == null) continue;
    const key = normaliseTitle(rec.title);
    const existing = empty.byTitle.get(key);
    // Same title can appear more than once (edits, live versions); keep the
    // rating backed by the most votes.
    if (!existing || rec.rating['votes-count'] > existing['votes-count']) {
      empty.byTitle.set(key, rec.rating);
    }
  }
  return empty;
}

/** Cover Art Archive front cover for a release group; free, keyless, redirects to the image. */
export function coverArtUrl(releaseGroupId: string, size: 250 | 500 | 1200 = 500): string {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-${size}`;
}

/**
 * Turning a raw iTunes discography into the list of records that actually
 * matter.
 *
 * iTunes returns every edition of everything: the standard album, the deluxe,
 * the explicit and clean variants, the anniversary reissue, the tour edition —
 * plus a long tail of one-track "albums" that exist so a single has somewhere to
 * live. Shown unfiltered that is four identical columns of the same record and a
 * wall of noise around them.
 */
import type { ItunesAlbum } from './itunes.js';
import { compactKey } from './match.js';

/** Edition markers to strip before deciding two releases are the same record. */
const EDITION_NOISE =
  /\b(deluxe|deluxe edition|expanded|expanded edition|explicit|clean|bonus track(s)? version|anniversary edition|remaster(ed)?( \d{4})?|special edition|tour edition|platinum edition|complete edition|reissue|super deluxe|extended|the collector'?s edition)\b/gi;

/** The record a release is an edition *of*. */
export function baseTitleKey(title: string): string {
  const stripped = title
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ') // drop bracketed qualifiers wholesale
    .replace(EDITION_NOISE, ' ')
    .replace(/\s*[-–—]\s*(ep|single)\s*$/i, ' ');
  return compactKey(stripped) || compactKey(title);
}

export interface RankedRelease {
  album: ItunesAlbum;
  /** How much of the artist's popular material sits on this record. */
  popularity: number;
}

/**
 * Collapse editions to one release each and drop the filler.
 *
 * Where several editions of a record exist we keep the fullest one, because the
 * point of this site is a complete tracklist to score — a deluxe with the bonus
 * cuts is strictly more of the record than the standard press. Ties go to the
 * original release date, so the record is dated when it came out rather than
 * when it was reissued.
 */
export function mainReleases(
  albums: ItunesAlbum[],
  popularityByTitle: Map<string, number>,
  { minTracks = 5 }: { minTracks?: number } = {},
): RankedRelease[] {
  const best = new Map<string, ItunesAlbum>();

  for (const album of albums) {
    if ((album.trackCount ?? 0) < minTracks) continue;
    const key = baseTitleKey(album.collectionName);
    if (!key) continue;

    const incumbent = best.get(key);
    if (!incumbent) {
      best.set(key, album);
      continue;
    }

    const moreTracks = (album.trackCount ?? 0) - (incumbent.trackCount ?? 0);
    if (moreTracks > 0) {
      best.set(key, album);
    } else if (moreTracks === 0) {
      const older = (album.releaseDate ?? '') < (incumbent.releaseDate ?? '');
      if (older) best.set(key, album);
    }
  }

  return [...best.entries()].map(([key, album]) => ({
    album,
    popularity: popularityByTitle.get(key) ?? 0,
  }));
}

/**
 * GET /api/search?q=...  ->  { artists, albums, songs }
 *
 * Ranking is the whole job here. iTunes' own artist search returns every act
 * whose name brushes the query, in no useful order — five different "Drake"s
 * before the one anybody means. So results are matched with the fuzzy keys in
 * match.ts, deduplicated by name, and ordered by match quality first and
 * audience size second.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  artworkAt,
  classifyAlbum,
  lookupArtistDiscography,
  searchAlbums,
  searchArtists,
  searchSongs,
  type ItunesAlbum,
} from './_lib/itunes.js';
import { searchArtists as searchDeezerArtists, type DeezerArtist } from './_lib/deezer.js';
import { cacheHeaders } from './_lib/http.js';
import { compactKey, matchScore, rankValue } from './_lib/match.js';
import { param, requireGet, sendError, sendJson } from './_lib/respond.js';

/** A match this strong means the query names one specific act. */
const STRONG_MATCH = 850;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireGet(req, res)) return;

  const q = param(req, 'q');
  if (!q) {
    sendJson(res, 400, { error: 'Missing required query parameter "q"' });
    return;
  }

  try {
    const [itunesArtists, albums, songs, deezerArtists] = await Promise.all([
      searchArtists(q, 25),
      searchAlbums(q, 20),
      searchSongs(q, 20),
      searchDeezerArtists(q, 20).catch(() => [] as DeezerArtist[]),
    ]);

    // Deezer keyed by name, keeping the *most followed* act of each name. Taking
    // the last one is how five identical "Drake" rows ended up sharing one
    // obscure folk singer's photo.
    const deezerByName = new Map<string, DeezerArtist>();
    for (const a of deezerArtists) {
      const key = compactKey(a.name);
      const existing = deezerByName.get(key);
      if (!existing || a.fans > existing.fans) deezerByName.set(key, a);
    }

    // One row per distinct name; among same-named acts keep the best match, and
    // break ties on the audience Deezer reports.
    const byName = new Map<
      string,
      { itunesArtistId: number; name: string; genre: string | null; points: number; fans: number }
    >();

    for (const a of itunesArtists) {
      const points = matchScore(a.artistName, q);
      if (points === 0) continue;
      const key = compactKey(a.artistName);
      const fans = deezerByName.get(key)?.fans ?? 0;
      const existing = byName.get(key);
      if (!existing || points > existing.points) {
        byName.set(key, {
          itunesArtistId: a.artistId,
          name: a.artistName,
          genre: a.primaryGenreName ?? null,
          points,
          fans,
        });
      }
    }

    const rankedArtists = [...byName.values()]
      .sort((a, b) => rankValue(b.points, b.fans) - rankValue(a.points, a.fans))
      .slice(0, 8)
      .map((a) => ({
        itunesArtistId: a.itunesArtistId,
        name: a.name,
        genre: a.genre,
        imageUrl: deezerByName.get(compactKey(a.name))?.imageUrl ?? null,
        fans: a.fans,
      }));

    // When the query clearly names one artist, their own records are what the
    // searcher wants — not every unrelated single that lists them as a feature.
    const lead = rankedArtists[0];
    const leadIsStrong = lead != null && matchScore(lead.name, q) >= STRONG_MATCH;
    let ownAlbums: ItunesAlbum[] = [];
    if (leadIsStrong) {
      ownAlbums = await lookupArtistDiscography(lead.itunesArtistId)
        .then((r) => r.albums)
        .catch(() => []);
    }

    const albumScore = (a: ItunesAlbum) => {
      const byArtist = lead && compactKey(a.artistName) === compactKey(lead.name);
      // Their own releases first, then how well the title itself matches, then
      // recency — which is what puts a current album above a decade-old one.
      const year = Number((a.releaseDate ?? '').slice(0, 4)) || 0;
      return (byArtist ? 2_000_000 : 0) + matchScore(a.collectionName, q) * 1000 + year;
    };

    const mergedAlbums = new Map<number, ItunesAlbum>();
    for (const a of [...ownAlbums, ...albums]) {
      if (!mergedAlbums.has(a.collectionId)) mergedAlbums.set(a.collectionId, a);
    }

    const rankedAlbums = [...mergedAlbums.values()]
      .sort((a, b) => albumScore(b) - albumScore(a))
      .slice(0, 24);

    const rankedSongs = songs
      .map((t) => {
        const byArtist = lead && compactKey(t.artistName) === compactKey(lead.name);
        return { t, score: (byArtist ? 1_000_000 : 0) + matchScore(t.trackName, q) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ t }) => t);

    sendJson(
      res,
      200,
      {
        query: q,
        artists: rankedArtists,
        albums: rankedAlbums.map((a) => ({
          itunesCollectionId: a.collectionId,
          itunesArtistId: a.artistId ?? null,
          title: a.collectionName,
          artistName: a.artistName,
          releaseDate: a.releaseDate ?? null,
          genre: a.primaryGenreName ?? null,
          trackCount: a.trackCount ?? null,
          albumType: classifyAlbum(a),
          coverUrl: artworkAt(a.artworkUrl100, 300),
        })),
        songs: rankedSongs.map((t) => ({
          itunesTrackId: t.trackId,
          itunesCollectionId: t.collectionId,
          title: t.trackName,
          artistName: t.artistName,
          coverUrl: artworkAt(t.artworkUrl100, 200),
          durationMs: t.trackTimeMillis ?? null,
        })),
      },
      cacheHeaders(60 * 60 * 6),
    );
  } catch (err) {
    sendError(res, err);
  }
}

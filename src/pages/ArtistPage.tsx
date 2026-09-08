import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchArtist } from '../lib/api';
import type { ArtistResponse } from '../lib/types';
import { formatYear, pluralise } from '../lib/format';
import './ArtistPage.css';

type Sort = 'popular' | 'chronological';

const NUMBER = new Intl.NumberFormat('en-US');

/**
 * An artist is a shelf of records, not a wall of every track they ever cut.
 *
 * The previous version fetched every album's tracklist up front, which meant
 * dozens of rate-limited lookups before the page settled — and then showed four
 * near-identical columns for each record's deluxe, explicit and reissue
 * editions. Scoring happens when a record is opened, on that record alone.
 */
export default function ArtistPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<ArtistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('popular');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    fetchArtist(id, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setData(response);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load this artist.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  const albums = useMemo(() => {
    const list = [...(data?.albums ?? [])];
    if (sort === 'chronological') {
      // Newest first: a discography reads backwards from what someone is
      // most likely to be looking for.
      list.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
    }
    return list;
  }, [data, sort]);

  if (loading) return <ArtistSkeleton />;

  if (error || !data) {
    return (
      <div className="container artist-page">
        <p className="artist-error" role="alert">{error ?? 'Artist not found.'}</p>
      </div>
    );
  }

  const { artist } = data;

  return (
    <div className="container artist-page">
      <header className="artist-hero">
        <div className="artist-photo">
          {artist.imageUrl ? (
            <img src={artist.imageUrl} alt="" />
          ) : (
            <span className="artist-initial" aria-hidden="true">{artist.name.slice(0, 1)}</span>
          )}
        </div>
        <div className="artist-herotext">
          <span className="tag">Artist</span>
          <h1 className="artist-name">{artist.name}</h1>
          <p className="muted artist-meta">
            {artist.genre ? `${artist.genre} · ` : ''}
            {pluralise(albums.length, 'album')}
            {artist.fans > 0 ? ` · ${NUMBER.format(artist.fans)} listeners` : ''}
          </p>
        </div>
      </header>

      <div className="artist-controls">
        <h2 className="section-title" style={{ margin: 0 }}>Discography</h2>
        <label className="artist-sort">
          <span className="visually-hidden">Sort albums</span>
          <select
            className="artist-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="popular">Most popular</option>
            <option value="chronological">Newest first</option>
          </select>
        </label>
      </div>

      {albums.length === 0 ? (
        <p className="muted">No albums found for this artist.</p>
      ) : (
        <div className="artist-grid">
          {albums.map((album) => (
            <Link
              key={album.itunesCollectionId}
              className="albumcard"
              to={`/album/${album.itunesCollectionId}`}
            >
              <span className="albumcard-art">
                {album.coverUrl && <img src={album.coverUrl} alt="" loading="lazy" />}
              </span>
              <span className="albumcard-title">{album.title}</span>
              <span className="muted albumcard-meta">
                {formatYear(album.releaseDate)}
                {album.trackCount ? ` · ${album.trackCount} tracks` : ''}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistSkeleton() {
  return (
    <div className="container artist-page">
      <div className="artist-hero">
        <div className="skeleton" style={{ width: 168, height: 168, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 40, width: 280, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, width: 180 }} />
        </div>
      </div>
      <div className="artist-grid" style={{ marginTop: 40 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: 0.85 }} />
        ))}
      </div>
    </div>
  );
}

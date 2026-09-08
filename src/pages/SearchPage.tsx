import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchCatalogue } from '../lib/api';
import type { SearchResponse } from '../lib/types';
import { formatDuration, formatYear } from '../lib/format';
import './SearchPage.css';

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get('q') ?? '';
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchCatalogue(query, controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Search failed.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  if (!query) {
    return (
      <div className="container search-page">
        <p className="muted">Type an artist, album or song in the search box above.</p>
      </div>
    );
  }

  const empty =
    data && data.artists.length === 0 && data.albums.length === 0 && data.songs.length === 0;

  return (
    <div className="container search-page">
      <h1 className="search-heading">
        <span className="muted">Results for</span> {query}
      </h1>

      {error && (
        <p className="search-error" role="alert">
          {error}
        </p>
      )}

      {loading && !data && (
        <div className="search-grid">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="skeleton search-skel" />
          ))}
        </div>
      )}

      {data && (
        <div style={{ opacity: loading ? 0.5 : 1 }}>
          {data.artists.length > 0 && (
            <section className="search-section">
              <h2 className="section-title">Artists</h2>
              <div className="rail">
                {data.artists.map((artist) => (
                  <Link
                    key={artist.itunesArtistId}
                    className="artistcard"
                    to={`/artist/${artist.itunesArtistId}`}
                  >
                    <span className="artistcard-photo">
                      {artist.imageUrl ? (
                        <img src={artist.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="artistcard-initial" aria-hidden="true">
                          {artist.name.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <span className="artistcard-name">{artist.name}</span>
                    {artist.genre && <span className="muted artistcard-genre">{artist.genre}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.albums.length > 0 && (
            <section className="search-section">
              <h2 className="section-title">Albums</h2>
              <div className="search-grid">
                {data.albums.map((album) => (
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
                      {album.artistName}
                      {album.releaseDate ? ` · ${formatYear(album.releaseDate)}` : ''}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.songs.length > 0 && (
            <section className="search-section">
              <h2 className="section-title">Songs</h2>
              <ul className="songlist">
                {data.songs.map((song) => (
                  <li key={song.itunesTrackId}>
                    <Link className="songrow" to={`/track/${song.itunesTrackId}`}>
                      <span className="songrow-art">
                        {song.coverUrl && <img src={song.coverUrl} alt="" loading="lazy" />}
                      </span>
                      <span className="songrow-text">
                        <span className="songrow-title">{song.title}</span>
                        <span className="muted songrow-artist">{song.artistName}</span>
                      </span>
                      <span className="muted songrow-time">{formatDuration(song.durationMs)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {empty && !loading && <p className="muted">Nothing found for “{query}”.</p>}
        </div>
      )}
    </div>
  );
}

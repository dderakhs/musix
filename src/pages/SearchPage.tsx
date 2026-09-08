import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchCatalogue } from '../lib/api';
import type { SearchResponse } from '../lib/types';
import { formatYear } from '../lib/format';
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
        <p className="muted">Type an artist or album in the search box above.</p>
      </div>
    );
  }

  return (
    <div className="container search-page">
      <h1 className="search-heading">
        Results for <span className="search-query">{query}</span>
      </h1>

      {error && <p className="search-error" role="alert">{error}</p>}

      {loading && !data && (
        <div className="search-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton search-skeleton" />
          ))}
        </div>
      )}

      {data && (
        <div style={{ opacity: loading ? 0.55 : 1 }}>
          {data.artists.length > 0 && (
            <section className="search-section">
              <h2 className="search-section-title">Artists</h2>
              <div className="search-artists">
                {data.artists.map((artist) => (
                  <Link
                    key={artist.itunesArtistId}
                    className="card search-artist"
                    to={`/artist/${artist.itunesArtistId}`}
                  >
                    <span className="search-artist-name">{artist.name}</span>
                    {artist.genre && <span className="muted search-artist-genre">{artist.genre}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.albums.length > 0 && (
            <section className="search-section">
              <h2 className="search-section-title">Albums</h2>
              <div className="search-grid">
                {data.albums.map((album) => (
                  <Link
                    key={album.itunesCollectionId}
                    className="search-album"
                    to={`/album/${album.itunesCollectionId}`}
                  >
                    <div className="search-cover">
                      {album.coverUrl ? (
                        <img src={album.coverUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="search-cover-empty" aria-hidden="true" />
                      )}
                    </div>
                    <div className="search-album-title">{album.title}</div>
                    <div className="muted search-album-meta">
                      {album.artistName}
                      {album.releaseDate ? ` · ${formatYear(album.releaseDate)}` : ''}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.artists.length === 0 && data.albums.length === 0 && !loading && (
            <p className="muted">Nothing found for “{query}”.</p>
          )}
        </div>
      )}
    </div>
  );
}

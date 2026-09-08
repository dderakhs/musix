import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchCatalogue } from '../lib/api';
import type { SearchResponse } from '../lib/types';
import { formatYear } from '../lib/format';
import './SearchBox.css';

interface Props {
  initialQuery?: string;
  placeholder?: string;
  /** Large centred variant for the home hero. */
  size?: 'default' | 'hero';
  autoFocus?: boolean;
}

interface Row {
  key: string;
  href: string;
  image: string | null;
  title: string;
  subtitle: string;
  kind: 'artist' | 'album' | 'song';
  round?: boolean;
}

/** Flatten the three result groups into one keyboard-navigable list. */
function toRows(data: SearchResponse): Row[] {
  const artists: Row[] = data.artists.slice(0, 3).map((a) => ({
    key: `artist-${a.itunesArtistId}`,
    href: `/artist/${a.itunesArtistId}`,
    image: a.imageUrl,
    title: a.name,
    subtitle: a.genre ?? 'Artist',
    kind: 'artist',
    round: true,
  }));
  const albums: Row[] = data.albums.slice(0, 4).map((a) => ({
    key: `album-${a.itunesCollectionId}`,
    href: `/album/${a.itunesCollectionId}`,
    image: a.coverUrl,
    title: a.title,
    subtitle: [a.artistName, formatYear(a.releaseDate)].filter(Boolean).join(' · '),
    kind: 'album',
  }));
  const songs: Row[] = data.songs.slice(0, 3).map((t) => ({
    key: `song-${t.itunesTrackId}`,
    href: `/track/${t.itunesTrackId}`,
    image: t.coverUrl,
    title: t.title,
    subtitle: `${t.artistName} · Song`,
    kind: 'song',
  }));
  return [...artists, ...albums, ...songs];
}

export default function SearchBox({
  initialQuery = '',
  placeholder = 'Search an artist, album or song…',
  size = 'default',
  autoFocus = false,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const term = query.trim();

  // Debounced lookup: typing should not fire a request per keystroke.
  useEffect(() => {
    if (term.length < 2) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchCatalogue(term, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setData(result);
            setActive(-1);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setData(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  // Close when focus or the pointer leaves the whole control.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const rows = useMemo(() => (data ? toRows(data) : []), [data]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate],
  );

  const submit = useCallback(() => {
    if (active >= 0 && rows[active]) {
      go(rows[active].href);
    } else if (term) {
      setOpen(false);
      navigate(`/search?q=${encodeURIComponent(term)}`);
    }
  }, [active, rows, term, go, navigate]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showPanel = open && term.length >= 2 && (rows.length > 0 || loading);

  return (
    <div className={`sbox sbox-${size}`} ref={wrapRef}>
      <div className="sbox-field">
        <svg className="sbox-icon" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          className="sbox-input"
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="sbox-listbox"
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {showPanel && (
        <div className="sbox-panel" id="sbox-listbox" role="listbox">
          {rows.length === 0 && loading && <div className="sbox-empty muted">Searching…</div>}

          {rows.map((row, i) => (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={i === active}
              className="sbox-row"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(row.href)}
            >
              <span className={`sbox-thumb${row.round ? ' sbox-thumb-round' : ''}`}>
                {row.image ? <img src={row.image} alt="" loading="lazy" /> : null}
              </span>
              <span className="sbox-text">
                <span className="sbox-title">{row.title}</span>
                <span className="sbox-sub muted">{row.subtitle}</span>
              </span>
            </button>
          ))}

          {rows.length > 0 && (
            <button
              type="button"
              className="sbox-all"
              onClick={() => {
                setOpen(false);
                navigate(`/search?q=${encodeURIComponent(term)}`);
              }}
            >
              Show all results for “{term}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import './Header.css';

type Theme = 'system' | 'light' | 'dark';

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem('musix:theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private browsing or blocked storage; fall back to the system setting */
  }
  return 'system';
}

interface Props {
  onRequestSignIn: () => void;
}

export default function Header({ onRequestSignIn }: Props) {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [theme, setTheme] = useState<Theme>(readTheme);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem('musix:theme');
      else localStorage.setItem('musix:theme', theme);
    } catch {
      /* nothing to do; the choice just will not persist */
    }
  }, [theme]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label="musix home">
          <span className="brand-mark" aria-hidden="true" />
          musix
        </Link>

        <form className="header-search" onSubmit={submit} role="search">
          <label htmlFor="header-search-input" className="visually-hidden">
            Search artists and albums
          </label>
          <input
            id="header-search-input"
            className="input"
            type="search"
            placeholder="Search an artist or album…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </form>

        <div className="header-actions">
          <button
            type="button"
            className="btn header-theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {!supabaseConfigured ? null : user ? (
            <>
              <span className="header-user muted" title={user.email ?? ''}>
                {user.email?.split('@')[0]}
              </span>
              <button type="button" className="btn" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onRequestSignIn}>
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import SearchBox from './SearchBox';
import ScoreModeToggle from './ScoreModeToggle';
import './Header.css';

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  try {
    return localStorage.getItem('musix:theme') === 'light' ? 'light' : 'dark';
  } catch {
    // Blocked storage: dark is the design default.
    return 'dark';
  }
}

interface Props {
  onRequestSignIn: () => void;
}

export default function Header({ onRequestSignIn }: Props) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('musix:theme', theme);
    } catch {
      // Nothing to do; the choice just will not persist.
    }
  }, [theme]);

  // The hero already carries a large search field; no need to repeat it.
  const showSearch = pathname !== '/';

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label="musix home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-word">musix</span>
        </Link>

        {showSearch && (
          <div className="header-search">
            <SearchBox />
          </div>
        )}

        <div className="header-actions">
          <ScoreModeToggle />

          <button
            type="button"
            className="btn header-icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {!supabaseConfigured ? null : user ? (
            <button type="button" className="btn" onClick={() => void signOut()}>
              Sign out
            </button>
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

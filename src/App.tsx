import { Suspense, lazy, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import AuthDialog from './components/AuthDialog';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import TrackPage from './pages/TrackPage';
import AboutPage from './pages/AboutPage';
import ChartsPage from './pages/ChartsPage';
import { supabaseConfigError, supabaseConfigured } from './lib/supabase';
import './App.css';

// The graph pulls in the charting library; keep it out of the landing bundle.
const ArtistPage = lazy(() => import('./pages/ArtistPage'));
const AlbumPage = lazy(() => import('./pages/AlbumPage'));

export default function App() {
  const [authOpen, setAuthOpen] = useState(false);
  const openAuth = () => setAuthOpen(true);

  return (
    <div className="app">
      <Header onRequestSignIn={openAuth} />

      {!supabaseConfigured && (
        <div className="app-banner" role="status">
          Sign-in, ratings and comments are unavailable: {supabaseConfigError} Public scores
          still work.
        </div>
      )}

      <main className="app-main">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/charts" element={<ChartsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/artist/:id" element={<ArtistPage onRequestSignIn={openAuth} />} />
            <Route path="/album/:id" element={<AlbumPage onRequestSignIn={openAuth} />} />
            <Route path="/track/:id" element={<TrackPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="app-footer">
        <div className="container app-footer-inner">
          <span className="muted">
            musix — public reception and member ratings, track by track.
          </span>
          <span className="app-footer-links">
            <Link to="/charts">Charts</Link>
            <Link to="/about">About</Link>
            <a href="https://github.com/dderakhs/musix">Source</a>
          </span>
        </div>
      </footer>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="container" style={{ padding: '34px 24px' }}>
      <div className="skeleton" style={{ height: 36, width: 280, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 380, borderRadius: 14 }} />
    </div>
  );
}

function NotFound() {
  return (
    <div className="container" style={{ padding: '80px 24px' }}>
      <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Not found</h1>
      <p className="muted">That page does not exist.</p>
    </div>
  );
}

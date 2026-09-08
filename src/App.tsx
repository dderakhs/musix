import { Suspense, lazy, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import AuthDialog from './components/AuthDialog';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import { supabaseConfigured } from './lib/supabase';
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
          Supabase is not configured, so sign-in and user scores are unavailable. Public
          scores still work.
        </div>
      )}

      <main className="app-main">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/artist/:id" element={<ArtistPage onRequestSignIn={openAuth} />} />
            <Route path="/album/:id" element={<AlbumPage onRequestSignIn={openAuth} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="app-footer">
        <div className="container app-footer-inner muted">
          <span>
            musix · public scores are composited from iTunes, MusicBrainz, Cover Art
            Archive, Deezer and Last.fm
          </span>
          <a href="https://github.com/dderakhs/musix">Source</a>
        </div>
      </footer>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="container" style={{ padding: '32px 20px' }}>
      <div className="skeleton" style={{ height: 34, width: 260, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 400, borderRadius: 10 }} />
    </div>
  );
}

function NotFound() {
  return (
    <div className="container" style={{ padding: '64px 20px' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Not found</h1>
      <p className="muted">That page does not exist.</p>
    </div>
  );
}

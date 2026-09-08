import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchAlbum } from '../lib/api';
import type { AggregateScore } from '../lib/ratings';
import type { AlbumResponse, Track } from '../lib/types';
import { formatScore, formatYear, pluralise } from '../lib/format';
import { tierFor } from '../lib/tiers';
import { useScoreMode } from '../lib/scoreMode';
import { useRatingSurface } from '../lib/useRatingSurface';
import ScoreGraph, { type SeriesKey } from '../components/ScoreGraph';
import RatingGrid, { valueFor } from '../components/RatingGrid';
import TrackTable from '../components/TrackTable';
import TrackDetail from '../components/TrackDetail';
import Comments from '../components/Comments';
import './AlbumPage.css';

interface Props {
  onRequestSignIn: () => void;
}

export default function AlbumPage({ onRequestSignIn }: Props) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const focusTrackId = params.get('track');

  const { mode, label } = useScoreMode();
  const [data, setData] = useState<AlbumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    publicScore: true,
    userScore: false,
  });

  // The graph leads with whichever score the site is set to.
  useEffect(() => {
    setVisible({ publicScore: mode === 'public', userScore: mode !== 'public' });
  }, [mode]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelectedTrackId(null);
    fetchAlbum(id, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        // Arriving from a song search or the chart: open on that track.
        if (focusTrackId) {
          const match = response.tracks.find(
            (t) => String(t.itunesTrackId ?? '') === focusTrackId,
          );
          if (match?.id) setSelectedTrackId(match.id);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load this album.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, focusTrackId]);

  const tracks = useMemo(() => data?.tracks ?? [], [data]);
  const trackIds = useMemo(
    () => tracks.map((t) => t.id).filter((v): v is string => Boolean(v)),
    [tracks],
  );

  const applyAggregates = useCallback((updates: Map<string, AggregateScore>) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            tracks: prev.tracks.map((t) => {
              const update = t.id ? updates.get(t.id) : undefined;
              return update ? { ...t, ...update } : t;
            }),
          }
        : prev,
    );
  }, []);

  const { myRatings, rate, clear, saving, error: ratingError, canRate } = useRatingSurface({
    trackIds,
    onAggregates: applyAggregates,
  });

  if (loading) {
    return (
      <div className="container album-page">
        <div className="skeleton" style={{ height: 240, borderRadius: 14, marginBottom: 26 }} />
        <div className="skeleton" style={{ height: 260, borderRadius: 14 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container album-page">
        <p className="album-error" role="alert">{error ?? 'Album not found.'}</p>
      </div>
    );
  }

  const { album } = data;
  const selectedTrack: Track | null = tracks.find((t) => t.id === selectedTrackId) ?? null;
  const isSingle = tracks.length <= 2 || album.albumType === 'single';

  const values = tracks.map((t) => valueFor(t, mode, myRatings)).filter((v): v is number => v != null);
  const headline = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const tier = tierFor(headline);
  const totalRatings = tracks.reduce((sum, t) => sum + t.userRatingCount, 0);

  const groups = [
    {
      id: album.id ?? String(album.itunesCollectionId),
      label: album.title,
      sublabel: formatYear(album.releaseDate),
      tracks,
    },
  ];

  return (
    <div className="container album-page">
      <header className="album-hero">
        <div className="album-heroart">
          {album.coverUrlLarge || album.coverUrl ? (
            <img src={album.coverUrlLarge ?? album.coverUrl ?? ''} alt={`${album.title} cover art`} />
          ) : (
            <div className="album-heroart-empty" aria-hidden="true" />
          )}
        </div>

        <div className="album-herotext">
          <span className="tag">{isSingle ? 'Single' : album.albumType}</span>
          <h1 className="album-title">{album.title}</h1>
          <p className="album-artist">
            {album.itunesArtistId ? (
              <Link to={`/artist/${album.itunesArtistId}`}>{album.artistName}</Link>
            ) : (
              album.artistName
            )}
            <span className="muted">
              {album.releaseDate ? ` · ${formatYear(album.releaseDate)}` : ''}
              {album.genre ? ` · ${album.genre}` : ''}
              {!isSingle ? ` · ${pluralise(tracks.length, 'track')}` : ''}
            </span>
          </p>

          <div className="album-headline">
            <span
              className="album-bigscore"
              style={tier ? { background: tier.colour, color: tier.ink } : undefined}
            >
              {formatScore(headline)}
            </span>
            <span className="album-headlinetext">
              <span className="album-tiername">{tier?.label ?? 'Not rated yet'}</span>
              <span className="muted album-headlinesub">
                {label}
                {mode === 'user' && totalRatings > 0 ? ` · ${pluralise(totalRatings, 'rating')}` : ''}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* The grid leads: the shape of the record before any of the detail. */}
      <section className="album-block">
        <RatingGrid
          groups={groups}
          myRatings={myRatings}
          albumCover={album.coverUrl}
          selectedTrackId={selectedTrackId}
          onSelectTrack={(track) => setSelectedTrackId(track.id)}
        />
      </section>

      {!isSingle && (
        <section className="album-block card album-graphcard">
          <ScoreGraph
            groups={groups}
            xAxis="tracks"
            visible={visible}
            onToggleSeries={(key) => setVisible((v) => ({ ...v, [key]: !v[key] }))}
            selectedTrackId={selectedTrackId}
            onSelectTrack={(track) => setSelectedTrackId(track.id)}
            emptyMessage="No public reception data for this release yet — rate a track to start the user score."
          />
        </section>
      )}

      <div className="album-body">
        <section>
          <h2 className="section-title">{isSingle ? 'Track' : 'Tracklist'}</h2>
          <TrackTable
            tracks={tracks}
            myRatings={myRatings}
            selectedTrackId={selectedTrackId}
            onSelect={(track) => setSelectedTrackId(track.id)}
          />

          <Comments albumId={album.id} onRequestSignIn={onRequestSignIn} />
        </section>

        <div className="album-side">
          {selectedTrack ? (
            <TrackDetail
              track={selectedTrack}
              albumTitle={album.title}
              coverUrl={selectedTrack.preview?.artUrl ?? album.coverUrl}
              myRating={selectedTrack.id ? myRatings.get(selectedTrack.id) ?? null : null}
              canRate={canRate}
              saving={saving}
              error={ratingError}
              onRate={(score) => selectedTrack.id && void rate(selectedTrack.id, score)}
              onClear={() => selectedTrack.id && void clear(selectedTrack.id)}
              onRequestSignIn={onRequestSignIn}
              onClose={() => setSelectedTrackId(null)}
            />
          ) : (
            <div className="card album-hint muted">
              Hover a cell for a preview, or pick one to see how its score was built — and to
              rate it yourself.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

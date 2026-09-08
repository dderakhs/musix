import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAlbum } from '../lib/api';
import type { AggregateScore } from '../lib/ratings';
import type { AlbumResponse, Track } from '../lib/types';
import { formatScore, formatYear, pluralise } from '../lib/format';
import { useRatingSurface } from '../lib/useRatingSurface';
import ScoreGraph, { type SeriesKey } from '../components/ScoreGraph';
import RatingGrid, { type Metric } from '../components/RatingGrid';
import TrackTable from '../components/TrackTable';
import TrackDetail from '../components/TrackDetail';
import './AlbumPage.css';

/** Upstreams wear their own capitalisation, not CSS's idea of it. */
const SOURCE_NAMES: Record<string, string> = {
  itunes: 'iTunes',
  musicbrainz: 'MusicBrainz',
  deezer: 'Deezer',
  lastfm: 'Last.fm',
  genius: 'Genius',
  reddit: 'Reddit',
};

interface Props {
  onRequestSignIn: () => void;
}

export default function AlbumPage({ onRequestSignIn }: Props) {
  const { id = '' } = useParams();
  const [data, setData] = useState<AlbumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    publicScore: true,
    userScore: true,
  });
  const [metric, setMetric] = useState<Metric>('public');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelectedTrackId(null);
    fetchAlbum(id, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setData(response);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load this album.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

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
        <div className="skeleton" style={{ height: 180, borderRadius: 10, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 340, borderRadius: 10 }} />
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
  const meanPublic = mean(tracks.map((t) => t.publicScore));
  const meanUser = mean(tracks.map((t) => t.userScore));
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
      <header className="album-head">
        {album.coverUrlLarge || album.coverUrl ? (
          <img
            className="album-cover"
            src={album.coverUrlLarge ?? album.coverUrl ?? ''}
            alt={`${album.title} cover art`}
          />
        ) : (
          <div className="album-cover album-cover-empty" aria-hidden="true" />
        )}

        <div className="album-head-text">
          <span className="tag">{album.albumType}</span>
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
            </span>
          </p>

          <dl className="album-stats">
            <div>
              <dt><span className="dot" style={{ background: 'var(--series-public)' }} />Public score</dt>
              <dd>{formatScore(meanPublic)}</dd>
              <span className="muted album-stat-note">mean across {pluralise(tracks.length, 'track')}</span>
            </div>
            <div>
              <dt><span className="dot" style={{ background: 'var(--series-user)' }} />User score</dt>
              <dd>{formatScore(meanUser)}</dd>
              <span className="muted album-stat-note">
                {totalRatings > 0 ? pluralise(totalRatings, 'rating') : 'no ratings yet'}
              </span>
            </div>
          </dl>

          <p className="muted album-sources">
            Sources: {Object.entries(data.sources)
              .filter(([, on]) => on)
              .map(([name]) => SOURCE_NAMES[name] ?? name)
              .join(' · ')}
          </p>
        </div>
      </header>

      <section className="card album-graph-card">
        <ScoreGraph
          groups={groups}
          xAxis="tracks"
          visible={visible}
          onToggleSeries={(key) => setVisible((v) => ({ ...v, [key]: !v[key] }))}
          selectedTrackId={selectedTrackId}
          onSelectTrack={(track) => setSelectedTrackId(track.id)}
          emptyMessage="No public reception data found for this release yet — rate a track to start the user score."
        />
      </section>

      <section className="card album-grid-card">
        <h2 className="album-section-title">Every track, by score</h2>
        <RatingGrid
          groups={groups}
          metric={metric}
          onChangeMetric={setMetric}
          myRatings={myRatings}
          selectedTrackId={selectedTrackId}
          onSelectTrack={(track) => setSelectedTrackId(track.id)}
          canRate={canRate}
        />
      </section>

      <div className="album-body">
        <section>
          <h2 className="album-section-title">Tracklist</h2>
          <TrackTable
            tracks={tracks}
            myRatings={myRatings}
            selectedTrackId={selectedTrackId}
            onSelect={(track) => setSelectedTrackId(track.id)}
          />
        </section>

        <div className="album-side">
          {selectedTrack ? (
            <TrackDetail
              track={selectedTrack}
              albumTitle={album.title}
              coverUrl={album.coverUrl}
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
              Pick a track to see how its public score was built — and to add your own rating.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

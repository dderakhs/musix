import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchAlbum, fetchArtist } from '../lib/api';
import { runPool } from '../lib/pool';
import type { AggregateScore } from '../lib/ratings';
import type { Album, ArtistResponse, Track } from '../lib/types';
import { formatScore, formatYear } from '../lib/format';
import { useRatingSurface } from '../lib/useRatingSurface';
import ScoreGraph, { type GraphGroup, type SeriesKey } from '../components/ScoreGraph';
import RatingGrid, { type Metric } from '../components/RatingGrid';
import TrackTable from '../components/TrackTable';
import TrackDetail from '../components/TrackDetail';
import './ArtistPage.css';

/** Album pages are fetched a few at a time; MusicBrainz allows ~1 request/second. */
const HYDRATE_CONCURRENCY = 3;
/** A long discography would otherwise fan out into hundreds of upstream calls. */
const HYDRATE_LIMIT = 24;

const TYPES: Array<{ id: string; label: string }> = [
  { id: 'album', label: 'Albums' },
  { id: 'ep', label: 'EPs' },
  { id: 'single', label: 'Singles' },
  { id: 'compilation', label: 'Compilations' },
];

const albumKey = (album: Album) => album.id ?? String(album.itunesCollectionId);

interface Props {
  onRequestSignIn: () => void;
}

export default function ArtistPage({ onRequestSignIn }: Props) {
  const { id = '' } = useParams();
  const [data, setData] = useState<ArtistResponse | null>(null);
  const [tracksByAlbum, setTracksByAlbum] = useState<Map<string, Track[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<Set<string>>(new Set(['album']));
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    publicScore: true,
    userScore: true,
  });
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('public');

  // Albums we have already asked for, so the hydration effect never loops.
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    attempted.current = new Set();
    setLoading(true);
    setError(null);
    setData(null);
    setTracksByAlbum(new Map());
    setSelectedTrackId(null);

    fetchArtist(id, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);

        // Seed from whatever is already in the catalogue, and mark those albums
        // as done so hydration only chases the gaps.
        const byAlbum = new Map<string, Track[]>();
        for (const track of response.tracks) {
          if (!track.albumId) continue;
          const list = byAlbum.get(track.albumId) ?? [];
          list.push(track);
          byAlbum.set(track.albumId, list);
        }
        for (const [key, list] of byAlbum) {
          list.sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber);
          attempted.current.add(key);
        }
        setTracksByAlbum(byAlbum);
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

  const selectedAlbums = useMemo(
    () => (data?.albums ?? []).filter((a) => types.has(a.albumType)),
    [data, types],
  );

  const typesKey = [...types].sort().join(',');

  useEffect(() => {
    if (!data) return;
    const queue = selectedAlbums
      .filter((album) => !attempted.current.has(albumKey(album)))
      .slice(0, HYDRATE_LIMIT);
    if (queue.length === 0) return;

    for (const album of queue) attempted.current.add(albumKey(album));

    const controller = new AbortController();
    setHydrating(true);
    void runPool(queue, HYDRATE_CONCURRENCY, async (album) => {
      const response = await fetchAlbum(
        album.id ?? album.itunesCollectionId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setTracksByAlbum((prev) => new Map(prev).set(albumKey(album), response.tracks));
    }).finally(() => {
      if (!controller.signal.aborted) setHydrating(false);
    });

    return () => controller.abort();
    // selectedAlbums is derived from data + types; typesKey keeps the dep stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, typesKey]);

  const groups = useMemo<GraphGroup[]>(
    () =>
      selectedAlbums
        .map((album) => ({
          id: albumKey(album),
          label: album.title,
          sublabel: formatYear(album.releaseDate),
          tracks: tracksByAlbum.get(albumKey(album)) ?? [],
        }))
        .filter((group) => group.tracks.length > 0),
    [selectedAlbums, tracksByAlbum],
  );

  const flatTracks = useMemo(() => groups.flatMap((g) => g.tracks), [groups]);
  const trackIds = useMemo(
    () => flatTracks.map((t) => t.id).filter((v): v is string => Boolean(v)),
    [flatTracks],
  );

  const albumLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const track of group.tracks) if (track.id) map.set(track.id, group.label);
    }
    return map;
  }, [groups]);

  const applyAggregates = useCallback((updates: Map<string, AggregateScore>) => {
    setTracksByAlbum((prev) => {
      const next = new Map(prev);
      for (const [key, list] of prev) {
        if (!list.some((t) => t.id && updates.has(t.id))) continue;
        next.set(
          key,
          list.map((t) => {
            const update = t.id ? updates.get(t.id) : undefined;
            return update ? { ...t, ...update } : t;
          }),
        );
      }
      return next;
    });
  }, []);

  const { myRatings, rate, clear, saving, error: ratingError, canRate } = useRatingSurface({
    trackIds,
    onAggregates: applyAggregates,
  });

  const selectedTrack = flatTracks.find((t) => t.id === selectedTrackId) ?? null;
  const selectedAlbum = selectedAlbums.find(
    (a) => albumKey(a) === groups.find((g) => g.tracks.some((t) => t.id === selectedTrackId))?.id,
  );

  const scored = flatTracks.filter((t) => t.publicScore != null || t.userScore != null);
  const meanPublic = mean(scored.map((t) => t.publicScore));
  const meanUser = mean(scored.map((t) => t.userScore));

  if (loading) return <PageSkeleton />;

  if (error || !data) {
    return (
      <div className="container artist-page">
        <p className="artist-error" role="alert">{error ?? 'Artist not found.'}</p>
      </div>
    );
  }

  return (
    <div className="container artist-page">
      <header className="artist-head">
        <div>
          <h1 className="artist-name">{data.artist.name}</h1>
          <p className="muted artist-meta">
            {data.artist.genre ? `${data.artist.genre} · ` : ''}
            {data.albums.length} releases on file
            {hydrating ? ' · loading tracks…' : ''}
          </p>
        </div>
        <dl className="artist-stats">
          <div>
            <dt><span className="dot" style={{ background: 'var(--series-public)' }} />Public</dt>
            <dd>{formatScore(meanPublic)}</dd>
          </div>
          <div>
            <dt><span className="dot" style={{ background: 'var(--series-user)' }} />User</dt>
            <dd>{formatScore(meanUser)}</dd>
          </div>
        </dl>
      </header>

      {/* One filter row above everything it scopes. */}
      <div className="artist-filters" role="group" aria-label="Release types">
        {TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className="btn artist-filter"
            aria-pressed={types.has(type.id)}
            onClick={() =>
              setTypes((prev) => {
                const next = new Set(prev);
                if (next.has(type.id)) next.delete(type.id);
                else next.add(type.id);
                // Never leave the graph with nothing to draw.
                return next.size === 0 ? new Set(['album']) : next;
              })
            }
          >
            {type.label}
          </button>
        ))}
      </div>

      <section className="card artist-graph-card">
        <ScoreGraph
          groups={groups}
          xAxis="groups"
          visible={visible}
          onToggleSeries={(key) => setVisible((v) => ({ ...v, [key]: !v[key] }))}
          selectedTrackId={selectedTrackId}
          onSelectTrack={(track) => setSelectedTrackId(track.id)}
          refreshing={hydrating}
          emptyMessage={
            hydrating ? 'Loading tracks…' : 'No scored tracks for the selected release types yet.'
          }
        />
      </section>

      <section className="card artist-grid-card">
        <h2 className="artist-section-title">Every track, by score</h2>
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

      <div className="artist-body">
        <section className="artist-tracks">
          <h2 className="artist-section-title">All tracks</h2>
          <TrackTable
            tracks={flatTracks}
            albumLabels={albumLabels}
            myRatings={myRatings}
            selectedTrackId={selectedTrackId}
            onSelect={(track) => setSelectedTrackId(track.id)}
          />
        </section>

        <div className="artist-side">
          {selectedTrack ? (
            <TrackDetail
              track={selectedTrack}
              albumTitle={albumLabels.get(selectedTrack.id ?? '') ?? ''}
              coverUrl={selectedAlbum?.coverUrl ?? null}
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
            <div className="card artist-hint muted">
              Pick a point on the graph or a row in the table to see how its public score was
              built — and to rate it yourself.
            </div>
          )}

          <section className="card artist-albums">
            <h2 className="artist-section-title">Releases</h2>
            <ul className="artist-album-list">
              {selectedAlbums.map((album) => (
                <li key={albumKey(album)}>
                  <Link className="artist-album" to={`/album/${album.itunesCollectionId}`}>
                    {album.coverUrl && <img src={album.coverUrl} alt="" loading="lazy" />}
                    <span className="artist-album-text">
                      <span className="artist-album-title">{album.title}</span>
                      <span className="muted artist-album-meta">
                        {formatYear(album.releaseDate)}
                        {album.trackCount ? ` · ${album.trackCount} tracks` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
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

function PageSkeleton() {
  return (
    <div className="container artist-page">
      <div className="skeleton" style={{ height: 34, width: 260, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 16, width: 180, marginBottom: 28 }} />
      <div className="skeleton" style={{ height: 400, borderRadius: 10 }} />
    </div>
  );
}

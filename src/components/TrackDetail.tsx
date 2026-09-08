import { useEffect, useRef, useState } from 'react';
import type { Track } from '../lib/types';
import { formatDuration, formatScore, pluralise } from '../lib/format';
import RatingStrip from './RatingStrip';
import ScoreBreakdown from './ScoreBreakdown';
import './TrackDetail.css';

interface Props {
  track: Track;
  albumTitle: string;
  coverUrl: string | null;
  myRating: number | null;
  canRate: boolean;
  saving: boolean;
  error: string | null;
  onRate: (score: number) => void;
  onClear: () => void;
  onRequestSignIn: () => void;
  onClose: () => void;
}

export default function TrackDetail({
  track,
  albumTitle,
  coverUrl,
  myRating,
  canRate,
  saving,
  error,
  onRate,
  onClear,
  onRequestSignIn,
  onClose,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // Stop the preview when the panel switches to a different track.
  useEffect(() => {
    setPlaying(false);
    audioRef.current?.pause();
  }, [track.id]);

  const togglePreview = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play().catch(() => setPlaying(false));
    }
  };

  return (
    <aside className="detail card" aria-label={`Details for ${track.title}`}>
      <button type="button" className="detail-close muted" onClick={onClose} aria-label="Close">
        ×
      </button>

      <header className="detail-head">
        {coverUrl && <img className="detail-cover" src={coverUrl} alt="" loading="lazy" />}
        <div className="detail-head-text">
          <div className="muted detail-album">{albumTitle}</div>
          <h3 className="detail-title">{track.title}</h3>
          <div className="muted detail-meta">
            Track {track.trackNumber}
            {track.durationMs ? ` · ${formatDuration(track.durationMs)}` : ''}
          </div>
          {track.previewUrl && (
            <>
              <button type="button" className="btn detail-preview" onClick={togglePreview}>
                {playing ? '❚❚ Pause preview' : '▶ Play preview'}
              </button>
              <audio
                ref={audioRef}
                src={track.previewUrl}
                preload="none"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            </>
          )}
        </div>
      </header>

      <div className="detail-scores">
        <div className="detail-score">
          <div className="detail-score-label">
            <span className="dot" style={{ background: 'var(--series-public)' }} />
            Public score
          </div>
          <div className="detail-score-value">{formatScore(track.publicScore)}</div>
          <div className="muted detail-score-note">Aggregate of public reviews</div>
        </div>
        <div className="detail-score">
          <div className="detail-score-label">
            <span className="dot" style={{ background: 'var(--series-user)' }} />
            User score
          </div>
          <div className="detail-score-value">{formatScore(track.userScore)}</div>
          <div className="muted detail-score-note">
            {track.userRatingCount > 0
              ? pluralise(track.userRatingCount, 'musix rating')
              : 'No musix ratings yet'}
          </div>
        </div>
      </div>

      <section className="detail-section">
        <h4 className="detail-section-title">Your rating</h4>
        {canRate ? (
          <RatingStrip
            value={myRating}
            disabled={saving || track.id == null}
            onRate={onRate}
            onClear={onClear}
          />
        ) : (
          <p className="detail-signin">
            <button type="button" className="btn btn-primary" onClick={onRequestSignIn}>
              Sign in to rate
            </button>
          </p>
        )}
        {error && (
          <p className="detail-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="detail-section">
        <h4 className="detail-section-title">How the public score is built</h4>
        <ScoreBreakdown breakdown={track.publicScoreSources} />
      </section>
    </aside>
  );
}

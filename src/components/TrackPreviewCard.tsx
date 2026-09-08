import type { Track } from '../lib/types';
import { formatDuration, formatScore } from '../lib/format';
import { tierFor } from '../lib/tiers';
import './TrackPreviewCard.css';

interface Props {
  track: Track;
  albumTitle: string;
  albumCover: string | null;
  score: number | null;
  /** Viewport rect of the cell being hovered, to anchor the card against. */
  anchor: DOMRect;
}

/**
 * The card that appears when a track is hovered, in the spirit of an episode
 * tooltip: a picture, what the thing is, and how it scored.
 *
 * The picture prefers Genius's song-specific art — a single's own cover, or a
 * video still — and falls back to the album sleeve. The text is deliberately
 * factual credits only: lyrics are licensed, and the written annotations on a
 * Genius page belong to the people who wrote them, so neither is reproduced here.
 */
export default function TrackPreviewCard({
  track,
  albumTitle,
  albumCover,
  score,
  anchor,
}: Props) {
  const tier = tierFor(score);
  const art = track.preview?.artUrl ?? albumCover;
  const credits = track.preview;

  // Anchor above the cell when there is room, otherwise below; clamp
  // horizontally so the card never runs off the viewport.
  const width = 300;
  const above = anchor.top > 260;
  const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 12));
  const style: React.CSSProperties = {
    width,
    left,
    ...(above ? { bottom: window.innerHeight - anchor.top + 10 } : { top: anchor.bottom + 10 }),
  };

  return (
    <div className="tpreview" style={style} role="tooltip">
      <div className="tpreview-head">
        {art && <img className="tpreview-art" src={art} alt="" loading="lazy" />}
        <div className="tpreview-headtext">
          <div className="tpreview-title">{track.title}</div>
          <div className="muted tpreview-meta">
            {albumTitle}
            {track.durationMs ? ` · ${formatDuration(track.durationMs)}` : ''}
          </div>
        </div>
      </div>

      <div className="tpreview-score">
        {tier ? (
          <>
            <span
              className="tpreview-badge"
              style={{ background: tier.colour, color: tier.ink }}
            >
              {formatScore(score)}
            </span>
            <span className="tpreview-tier">{tier.label}</span>
          </>
        ) : (
          <span className="muted tpreview-tier">Not rated yet</span>
        )}
      </div>

      {credits && (credits.releaseDate || credits.producers.length > 0) && (
        <dl className="tpreview-credits">
          {credits.releaseDate && (
            <div>
              <dt>Released</dt>
              <dd>{credits.releaseDate}</dd>
            </div>
          )}
          {credits.producers.length > 0 && (
            <div>
              <dt>Produced by</dt>
              <dd>{credits.producers.join(', ')}</dd>
            </div>
          )}
          {credits.writers.length > 0 && (
            <div>
              <dt>Written by</dt>
              <dd>{credits.writers.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

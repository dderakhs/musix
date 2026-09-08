import { useMemo, useState } from 'react';
import type { Track } from '../lib/types';
import type { GraphGroup } from './ScoreGraph';
import { formatScore } from '../lib/format';
import { TIERS, tierFor } from '../lib/tiers';
import { useScoreMode } from '../lib/scoreMode';
import TrackPreviewCard from './TrackPreviewCard';
import './RatingGrid.css';

interface Props {
  groups: GraphGroup[];
  myRatings: Map<string, number>;
  albumCover?: string | null;
  selectedTrackId?: string | null;
  onSelectTrack: (track: Track) => void;
}

/** The value the grid paints, per the site-wide score mode. */
export function valueFor(
  track: Track,
  mode: 'public' | 'user' | 'mine',
  myRatings: Map<string, number>,
): number | null {
  if (mode === 'public') return track.publicScore;
  if (mode === 'user') return track.userScore;
  return track.id ? myRatings.get(track.id) ?? null : null;
}

/**
 * The album/discography grid: one cell per track, coloured by the tier its score
 * falls in. Reading a record's shape should not require reading a single number
 * — though the number is always printed, so colour is never the only channel.
 */
export default function RatingGrid({
  groups,
  myRatings,
  albumCover = null,
  selectedTrackId,
  onSelectTrack,
}: Props) {
  const { mode } = useScoreMode();
  const [hover, setHover] = useState<{ track: Track; anchor: DOMRect } | null>(null);

  const filled = useMemo(() => groups.filter((g) => g.tracks.length > 0), [groups]);
  const rows = useMemo(() => Math.max(0, ...filled.map((g) => g.tracks.length)), [filled]);

  if (filled.length === 0 || rows === 0) return null;

  const single = filled.length === 1;

  const cellFor = (track: Track, group: GraphGroup, label: string, showLabel: boolean) => {
    const value = valueFor(track, mode, myRatings);
    const tier = tierFor(value);
    const selected = track.id != null && track.id === selectedTrackId;

    return (
      <button
        key={track.id ?? `${group.id}-${label}`}
        type="button"
        className="rgrid-cell"
        data-rated={value != null}
        data-selected={selected}
        style={tier ? { background: tier.colour, color: tier.ink } : undefined}
        aria-label={`${track.title}, ${group.label}, ${
          value != null ? `${formatScore(value)} out of 10, ${tier?.label}` : 'no score'
        }`}
        onMouseEnter={(e) =>
          setHover({ track, anchor: e.currentTarget.getBoundingClientRect() })
        }
        onFocus={(e) => setHover({ track, anchor: e.currentTarget.getBoundingClientRect() })}
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onClick={() => onSelectTrack(track)}
      >
        {showLabel && <span className="rgrid-cell-num">{label}</span>}
        <span className="rgrid-cell-value">{value == null ? '–' : formatScore(value)}</span>
      </button>
    );
  };

  return (
    <section className="rgrid" aria-label="Rating grid">
      <TierLegend />

      <div className="rgrid-scroll">
        {single ? (
          <div className="rgrid-flow">
            {filled[0].tracks.map((track, index) =>
              cellFor(track, filled[0], String(track.trackNumber || index + 1), true),
            )}
          </div>
        ) : (
          <div
            className="rgrid-matrix"
            style={{ gridTemplateColumns: `34px repeat(${filled.length}, minmax(42px, 1fr))` }}
          >
            <div className="rgrid-corner" aria-hidden="true" />
            {filled.map((group) => (
              <div key={group.id} className="rgrid-col-head" title={group.label}>
                <span className="rgrid-col-title">{group.label}</span>
                {group.sublabel && <span className="muted rgrid-col-year">{group.sublabel}</span>}
              </div>
            ))}

            {Array.from({ length: rows }, (_, row) => (
              <div className="rgrid-rowgroup" key={row} role="row">
                <div className="rgrid-row-head muted">{row + 1}</div>
                {filled.map((group) => {
                  const track = group.tracks[row];
                  return track ? (
                    cellFor(track, group, String(track.trackNumber || row + 1), false)
                  ) : (
                    <div key={group.id} className="rgrid-cell-absent" />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {hover && (
        <TrackPreviewCard
          track={hover.track}
          albumTitle={
            filled.find((g) => g.tracks.some((t) => t.id === hover.track.id))?.label ?? ''
          }
          albumCover={albumCover}
          score={valueFor(hover.track, mode, myRatings)}
          anchor={hover.anchor}
        />
      )}
    </section>
  );
}

/** Names the bands, so a colour always has a word attached to it. */
export function TierLegend() {
  return (
    <div className="tier-legend">
      {TIERS.map((tier) => (
        <span key={tier.id} className="tier-legend-item">
          <span className="dot" style={{ background: tier.colour }} aria-hidden="true" />
          {tier.label}
        </span>
      ))}
    </div>
  );
}

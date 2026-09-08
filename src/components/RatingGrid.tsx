import { useMemo } from 'react';
import type { Track } from '../lib/types';
import type { GraphGroup } from './ScoreGraph';
import { formatScore } from '../lib/format';
import './RatingGrid.css';

export type Metric = 'public' | 'user' | 'mine';

interface Props {
  groups: GraphGroup[];
  metric: Metric;
  onChangeMetric: (metric: Metric) => void;
  myRatings: Map<string, number>;
  selectedTrackId?: string | null;
  onSelectTrack: (track: Track) => void;
  /** "Yours" is only offered once the viewer can actually rate. */
  canRate: boolean;
}

const METRICS: Array<{ id: Metric; label: string }> = [
  { id: 'public', label: 'Public' },
  { id: 'user', label: 'User' },
  { id: 'mine', label: 'Yours' },
];

/** Which hue ramp a metric is drawn from — user-derived scores keep the orange identity. */
const rampFor = (metric: Metric) => (metric === 'public' ? 'public' : 'user');

function valueOf(track: Track, metric: Metric, myRatings: Map<string, number>): number | null {
  if (metric === 'public') return track.publicScore;
  if (metric === 'user') return track.userScore;
  return track.id ? myRatings.get(track.id) ?? null : null;
}

/** Ratings are continuous but the ramp has ten steps; snap to the nearest. */
const stepOf = (value: number) => Math.max(1, Math.min(10, Math.round(value)));

export default function RatingGrid({
  groups,
  metric,
  onChangeMetric,
  myRatings,
  selectedTrackId,
  onSelectTrack,
  canRate,
}: Props) {
  const filled = useMemo(() => groups.filter((g) => g.tracks.length > 0), [groups]);
  const rows = useMemo(
    () => Math.max(0, ...filled.map((g) => g.tracks.length)),
    [filled],
  );

  if (filled.length === 0 || rows === 0) return null;

  const ramp = rampFor(metric);
  const single = filled.length === 1;
  const metrics = METRICS.filter((m) => m.id !== 'mine' || canRate);

  return (
    <section className="rgrid" aria-label="Rating grid">
      <header className="rgrid-head">
        <div className="rgrid-metrics" role="group" aria-label="Score to colour by">
          {metrics.map((m) => (
            <button
              key={m.id}
              type="button"
              className="btn rgrid-metric"
              aria-pressed={metric === m.id}
              onClick={() => onChangeMetric(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Legend ramp={ramp} />
      </header>

      <div className="rgrid-scroll">
        {single ? (
          <div className="rgrid-flow">
            {filled[0].tracks.map((track, index) => (
              <Cell
                key={track.id ?? index}
                track={track}
                label={String(track.trackNumber || index + 1)}
                albumTitle={filled[0].label}
                value={valueOf(track, metric, myRatings)}
                ramp={ramp}
                metric={metric}
                selected={track.id != null && track.id === selectedTrackId}
                onSelect={onSelectTrack}
                showLabel
              />
            ))}
          </div>
        ) : (
          <div
            className="rgrid-matrix"
            style={{ gridTemplateColumns: `34px repeat(${filled.length}, minmax(40px, 1fr))` }}
          >
            <div className="rgrid-corner" aria-hidden="true" />
            {filled.map((group) => (
              <div key={group.id} className="rgrid-col-head" title={group.label}>
                <span className="rgrid-col-title">{group.label}</span>
                {group.sublabel && <span className="muted rgrid-col-year">{group.sublabel}</span>}
              </div>
            ))}

            {Array.from({ length: rows }, (_, row) => (
              <Row
                key={row}
                row={row}
                groups={filled}
                metric={metric}
                ramp={ramp}
                myRatings={myRatings}
                selectedTrackId={selectedTrackId}
                onSelectTrack={onSelectTrack}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface RowProps {
  row: number;
  groups: GraphGroup[];
  metric: Metric;
  ramp: string;
  myRatings: Map<string, number>;
  selectedTrackId?: string | null;
  onSelectTrack: (track: Track) => void;
}

function Row({ row, groups, metric, ramp, myRatings, selectedTrackId, onSelectTrack }: RowProps) {
  return (
    <>
      <div className="rgrid-row-head muted">{row + 1}</div>
      {groups.map((group) => {
        const track = group.tracks[row];
        if (!track) return <div key={group.id} className="rgrid-cell rgrid-cell-absent" />;
        return (
          <Cell
            key={group.id}
            track={track}
            label={String(track.trackNumber || row + 1)}
            albumTitle={group.label}
            value={valueOf(track, metric, myRatings)}
            ramp={ramp}
            metric={metric}
            selected={track.id != null && track.id === selectedTrackId}
            onSelect={onSelectTrack}
          />
        );
      })}
    </>
  );
}

interface CellProps {
  track: Track;
  label: string;
  albumTitle: string;
  value: number | null;
  ramp: string;
  metric: Metric;
  selected: boolean;
  onSelect: (track: Track) => void;
  showLabel?: boolean;
}

function Cell({
  track,
  label,
  albumTitle,
  value,
  ramp,
  metric,
  selected,
  onSelect,
  showLabel = false,
}: CellProps) {
  const rated = value != null;
  const step = rated ? stepOf(value) : null;
  const text = rated ? (metric === 'mine' ? value.toFixed(0) : formatScore(value)) : '–';

  return (
    <button
      type="button"
      className="rgrid-cell"
      data-rated={rated}
      data-selected={selected}
      style={
        step
          ? {
              // Each step ships its own ink, so the number always clears contrast.
              background: `var(--rate-${ramp}-${step})`,
              color: `var(--rate-${ramp}-${step}-ink)`,
            }
          : undefined
      }
      title={`${albumTitle} · ${track.trackNumber}. ${track.title} — ${rated ? text : 'unrated'}`}
      aria-label={`${track.title}, ${albumTitle}, track ${track.trackNumber}, ${
        rated ? `${text} out of 10` : 'no score'
      }`}
      onClick={() => onSelect(track)}
    >
      {showLabel && <span className="rgrid-cell-num">{label}</span>}
      <span className="rgrid-cell-value">{text}</span>
    </button>
  );
}

/** A sequential ramp always ships a scale legend. */
function Legend({ ramp }: { ramp: string }) {
  return (
    <div className="rgrid-legend">
      <span className="muted rgrid-legend-cap">1</span>
      <span className="rgrid-legend-swatches" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{ background: `var(--rate-${ramp}-${i + 1})` }} />
        ))}
      </span>
      <span className="muted rgrid-legend-cap">10</span>
    </div>
  );
}

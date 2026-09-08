import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Track } from '../lib/types';
import { formatScore } from '../lib/format';
import './ScoreGraph.css';

export interface GraphGroup {
  id: string;
  label: string;
  sublabel?: string;
  tracks: Track[];
}

export type SeriesKey = 'publicScore' | 'userScore';

interface Props {
  groups: GraphGroup[];
  /** Album bands + album names on the x-axis (artist view) vs plain track numbers. */
  xAxis: 'groups' | 'tracks';
  visible: Record<SeriesKey, boolean>;
  onToggleSeries: (key: SeriesKey) => void;
  selectedTrackId?: string | null;
  onSelectTrack?: (track: Track) => void;
  /** Held at reduced opacity during a refetch instead of flashing a skeleton. */
  refreshing?: boolean;
  emptyMessage?: string;
}

interface Point {
  x: number;
  publicScore: number | null;
  userScore: number | null;
  track: Track | null;
  groupId: string;
  groupLabel: string;
}

interface Band {
  id: string;
  label: string;
  sublabel?: string;
  from: number;
  to: number;
  centre: number;
}

const SERIES: Record<SeriesKey, { label: string; cssVar: string; description: string }> = {
  publicScore: {
    label: 'Public score',
    cssVar: 'var(--series-public)',
    description: 'Aggregate of public reviews and reception signals',
  },
  userScore: {
    label: 'User score',
    cssVar: 'var(--series-user)',
    description: 'Mean of musix members’ own ratings',
  },
};

/**
 * Lay the tracks out left to right, one x slot each, with a blank slot between
 * groups so the connecting lines break at album boundaries.
 */
function buildSeries(groups: GraphGroup[]): { points: Point[]; bands: Band[] } {
  const points: Point[] = [];
  const bands: Band[] = [];
  let x = 0;

  for (const group of groups) {
    if (group.tracks.length === 0) continue;
    const from = x;
    for (const track of group.tracks) {
      points.push({
        x,
        publicScore: track.publicScore,
        userScore: track.userScore,
        track,
        groupId: group.id,
        groupLabel: group.label,
      });
      x += 1;
    }
    const to = x - 1;
    bands.push({
      id: group.id,
      label: group.label,
      sublabel: group.sublabel,
      from,
      to,
      centre: (from + to) / 2,
    });
    // Blank slot between albums: breaks the connecting line and gives the bands
    // air. Not appended after the last group, where it would only leave a gap of
    // dead plot area on the right.
    if (group !== groups[groups.length - 1]) {
      points.push({
        x,
        publicScore: null,
        userScore: null,
        track: null,
        groupId: `${group.id}:gap`,
        groupLabel: '',
      });
      x += 1;
    }
  }

  return { points, bands };
}

/** The one point worth calling out per series: its highest-scoring track. */
function findPeak(points: Point[], key: SeriesKey): Point | null {
  let best: Point | null = null;
  for (const p of points) {
    const v = p[key];
    if (v == null) continue;
    if (!best || v > (best[key] as number)) best = p;
  }
  return best;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: Point;
  radius: number;
  colour: string;
  selectedTrackId?: string | null;
}

/**
 * A dot with a 2px surface ring so it stays legible where the two series cross.
 * The ring is drawn in the surface colour rather than as a stroke around the mark.
 */
function ScoreDot({ cx, cy, payload, radius, colour, selectedTrackId }: DotProps) {
  if (cx == null || cy == null || !payload?.track) return null;
  const selected = selectedTrackId != null && payload.track.id === selectedTrackId;
  const r = selected ? radius + 1.5 : radius;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 2} fill="var(--surface-1)" />
      <circle cx={cx} cy={cy} r={r} fill={colour} />
      {selected && (
        <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={colour} strokeWidth={1.5} />
      )}
    </g>
  );
}

/** Shape Recharts hands a custom axis tick; widened so it accepts the real props. */
interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
}

function makeGroupTick(bands: Band[], maxChars: number, everyNth: number) {
  return function GroupTick({ x, y, payload }: TickProps) {
    const band = bands.find((b) => b.centre === Number(payload?.value));
    if (!band) return null;
    const index = bands.indexOf(band);
    if (index % everyNth !== 0) return null;
    const text =
      band.label.length > maxChars ? `${band.label.slice(0, maxChars - 1)}…` : band.label;
    return (
      <g transform={`translate(${Number(x ?? 0)},${Number(y ?? 0) + 10})`}>
        <text
          className="graph-axis-text"
          textAnchor="end"
          transform="rotate(-35)"
          dominantBaseline="middle"
        >
          {text}
        </text>
      </g>
    );
  };
}

export default function ScoreGraph({
  groups,
  xAxis,
  visible,
  onToggleSeries,
  selectedTrackId,
  onSelectTrack,
  refreshing = false,
  emptyMessage = 'No scored tracks yet.',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { points, bands } = useMemo(() => buildSeries(groups), [groups]);

  const plotWidth = Math.max(width - 56, 120);
  const pxPerPoint = points.length > 0 ? plotWidth / points.length : 24;
  // Shrink the marker under density rather than letting dots merge into a blob;
  // the tooltip column and the table below carry the values either way.
  const dotRadius = Math.max(2, Math.min(4.5, pxPerPoint / 3));
  // Only label as many album bands as will fit without colliding.
  const everyNth = Math.max(1, Math.ceil((bands.length * 78) / Math.max(plotWidth, 1)));
  const maxChars = Math.max(6, Math.floor(Math.min(22, (pxPerPoint * points.length) / 60)));

  const groupTick = useMemo(
    () => makeGroupTick(bands, maxChars, everyNth),
    [bands, maxChars, everyNth],
  );

  const hasAnyScore = points.some((p) => p.publicScore != null || p.userScore != null);
  const peaks: Array<{ key: SeriesKey; point: Point }> = (
    ['publicScore', 'userScore'] as SeriesKey[]
  )
    .filter((key) => visible[key])
    .map((key) => ({ key, point: findPeak(points, key) }))
    .filter((entry): entry is { key: SeriesKey; point: Point } => entry.point !== null);

  if (points.length === 0 || !hasAnyScore) {
    return (
      <div className="graph-empty card" role="status">
        {emptyMessage}
      </div>
    );
  }

  return (
    <figure className="graph" ref={wrapRef}>
      <figcaption className="graph-legend">
        {(Object.keys(SERIES) as SeriesKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className="graph-legend-item"
            aria-pressed={visible[key]}
            onClick={() => onToggleSeries(key)}
            title={SERIES[key].description}
          >
            <span
              className="graph-legend-swatch"
              style={{
                background: SERIES[key].cssVar,
                opacity: visible[key] ? 1 : 0.25,
              }}
              aria-hidden="true"
            />
            <span style={{ opacity: visible[key] ? 1 : 0.45 }}>{SERIES[key].label}</span>
          </button>
        ))}
        <span className="graph-legend-hint muted">Click a series to hide it</span>
      </figcaption>

      <div
        className="graph-plot"
        style={{ opacity: refreshing ? 0.55 : 1 }}
        aria-hidden="true"
      >
        <ResponsiveContainer width="100%" height={xAxis === 'groups' ? 380 : 320}>
          <LineChart
            data={points}
            margin={{ top: 26, right: 16, bottom: xAxis === 'groups' ? 62 : 24, left: 0 }}
            onClick={(state) => {
              // Recharts reports the active index into `data`, not the datum.
              const index = Number(state?.activeIndex);
              const point = Number.isInteger(index) ? points[index] : undefined;
              if (point?.track && onSelectTrack) onSelectTrack(point.track);
            }}
          >
            {bands.length > 1 &&
              bands.map((band, i) => (
                <ReferenceArea
                  key={band.id}
                  x1={band.from - 0.5}
                  x2={band.to + 0.5}
                  fill="var(--band)"
                  fillOpacity={i % 2 === 0 ? 1 : 0}
                  stroke="none"
                  ifOverflow="extendDomain"
                />
              ))}

            <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />

            <XAxis
              dataKey="x"
              type="number"
              domain={[-0.5, points.length - 0.5]}
              ticks={
                xAxis === 'groups'
                  ? bands.map((b) => b.centre)
                  : points.filter((p) => p.track).map((p) => p.x)
              }
              tick={
                xAxis === 'groups'
                  ? groupTick
                  : { fill: 'var(--text-muted)', fontSize: 11 }
              }
              tickFormatter={
                xAxis === 'tracks'
                  ? (value: number) =>
                      String(points.find((p) => p.x === value)?.track?.trackNumber ?? '')
                  : undefined
              }
              axisLine={{ stroke: 'var(--axis)' }}
              tickLine={false}
              interval={0}
              height={xAxis === 'groups' ? 62 : 24}
            />

            <YAxis
              domain={[0, 10]}
              ticks={[0, 2, 4, 6, 8, 10]}
              width={40}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
              isAnimationActive={false}
              content={<GraphTooltip />}
            />

            {visible.publicScore && (
              <Line
                type="linear"
                dataKey="publicScore"
                name="Public score"
                stroke="var(--series-public)"
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
                dot={
                  <ScoreDot
                    radius={dotRadius}
                    colour="var(--series-public)"
                    selectedTrackId={selectedTrackId}
                  />
                }
              />
            )}

            {visible.userScore && (
              <Line
                type="linear"
                dataKey="userScore"
                name="User score"
                stroke="var(--series-user)"
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
                dot={
                  <ScoreDot
                    radius={dotRadius}
                    colour="var(--series-user)"
                    selectedTrackId={selectedTrackId}
                  />
                }
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {peaks.length > 0 && (
        <p className="graph-peaks">
          {peaks.map(({ key, point }) => (
            <span key={key} className="graph-peak">
              <span className="dot" style={{ background: SERIES[key].cssVar }} aria-hidden="true" />
              <span className="muted">Highest {SERIES[key].label.toLowerCase()}</span>
              <strong>{point.track?.title}</strong>
              <span className="graph-peak-value">{formatScore(point[key])}</span>
            </span>
          ))}
        </p>
      )}
    </figure>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
}

function GraphTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point?.track) return null;
  const { track } = point;
  return (
    <div className="graph-tooltip card">
      <div className="graph-tooltip-album muted">{point.groupLabel}</div>
      <div className="graph-tooltip-title">
        {track.trackNumber}. {track.title}
      </div>
      <dl className="graph-tooltip-scores">
        <div>
          <dt>
            <span className="dot" style={{ background: 'var(--series-public)' }} />
            Public
          </dt>
          <dd>{formatScore(track.publicScore)}</dd>
        </div>
        <div>
          <dt>
            <span className="dot" style={{ background: 'var(--series-user)' }} />
            User
          </dt>
          <dd>
            {formatScore(track.userScore)}
            {track.userRatingCount > 0 && (
              <span className="muted"> · {track.userRatingCount}</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

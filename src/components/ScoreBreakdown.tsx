import type { PublicScoreBreakdown } from '../lib/types';
import { formatScore } from '../lib/format';
import './ScoreBreakdown.css';

interface Props {
  breakdown: PublicScoreBreakdown | null | undefined;
}

const NUMBER = new Intl.NumberFormat('en-US');

function describe(detail: Record<string, number | string | null>): string {
  const parts: string[] = [];
  if (typeof detail.stars === 'number') parts.push(`${detail.stars.toFixed(2)}/5 stars`);
  if (typeof detail.votes === 'number') parts.push(`${NUMBER.format(detail.votes)} votes`);
  if (typeof detail.rank === 'number') parts.push(`rank ${NUMBER.format(detail.rank)}`);
  if (typeof detail.playcount === 'number')
    parts.push(`${NUMBER.format(detail.playcount)} plays`);
  return parts.join(' · ');
}

/**
 * Shows the working behind the public score. The number is a composite, so it
 * would be dishonest to present it without saying what went into it.
 */
export default function ScoreBreakdown({ breakdown }: Props) {
  if (!breakdown || breakdown.signals.length === 0) {
    return (
      <p className="breakdown-empty muted">
        No public reception data found for this track yet. MusicBrainz ratings and
        streaming-popularity figures are sparse outside well-known releases.
      </p>
    );
  }

  const total = breakdown.signals.reduce((sum, s) => sum + s.weight, 0);

  return (
    <div className="breakdown">
      <ul className="breakdown-list">
        {breakdown.signals.map((signal) => (
          <li key={signal.source} className="breakdown-row">
            <div className="breakdown-row-head">
              <span className="breakdown-label">{signal.label}</span>
              <span className="breakdown-score">{formatScore(signal.score)}</span>
            </div>
            <div className="breakdown-meter" aria-hidden="true">
              <span
                className="breakdown-meter-fill"
                style={{ width: `${total > 0 ? (signal.weight / total) * 100 : 0}%` }}
              />
            </div>
            <div className="breakdown-detail muted">
              {describe(signal.detail)}
              {' · '}
              {Math.round(total > 0 ? (signal.weight / total) * 100 : 0)}% of the weight
            </div>
          </li>
        ))}
      </ul>
      <p className="breakdown-confidence muted">
        Confidence {Math.round(breakdown.confidence * 100)}% — how much public evidence
        backs this score.
      </p>
    </div>
  );
}

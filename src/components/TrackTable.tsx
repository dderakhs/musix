import type { Track } from '../lib/types';
import { formatDuration, formatScore } from '../lib/format';
import './TrackTable.css';

interface Props {
  tracks: Track[];
  /** Album name per track id; omit for a single-album table. */
  albumLabels?: Map<string, string>;
  myRatings: Map<string, number>;
  selectedTrackId?: string | null;
  onSelect: (track: Track) => void;
}

/**
 * The table view twin of the graph: every value the chart encodes is readable
 * here as text, so nothing is gated behind hover or colour.
 */
export default function TrackTable({
  tracks,
  albumLabels,
  myRatings,
  selectedTrackId,
  onSelect,
}: Props) {
  if (tracks.length === 0) return null;

  return (
    <div className="track-table-wrap">
      <table className="track-table">
        <caption className="visually-hidden">
          Tracks with their public score, musix user score and your own rating
        </caption>
        <thead>
          <tr>
            <th scope="col" className="col-num">
              #
            </th>
            <th scope="col">Track</th>
            {albumLabels && <th scope="col" className="col-album">Album</th>}
            <th scope="col" className="col-time">Length</th>
            <th scope="col" className="col-score">
              <span className="dot" style={{ background: 'var(--series-public)' }} />
              Public
            </th>
            <th scope="col" className="col-score">
              <span className="dot" style={{ background: 'var(--series-user)' }} />
              User
            </th>
            <th scope="col" className="col-score">Yours</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => {
            const mine = track.id ? myRatings.get(track.id) : undefined;
            const selected = track.id != null && track.id === selectedTrackId;
            return (
              <tr
                key={track.id ?? `${track.discNumber}-${track.trackNumber}-${track.title}`}
                data-selected={selected}
                tabIndex={0}
                role="button"
                aria-label={`Open ${track.title}`}
                onClick={() => onSelect(track)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(track);
                  }
                }}
              >
                <td className="col-num">{track.trackNumber}</td>
                <td>
                  <span className="track-title">{track.title}</span>
                  {track.explicit && <span className="explicit" title="Explicit">E</span>}
                </td>
                {albumLabels && (
                  <td className="col-album secondary">
                    {(track.id && albumLabels.get(track.id)) ?? track.albumTitle ?? ''}
                  </td>
                )}
                <td className="col-time muted">{formatDuration(track.durationMs)}</td>
                <td className="col-score">{formatScore(track.publicScore)}</td>
                <td className="col-score">
                  {formatScore(track.userScore)}
                  {track.userRatingCount > 0 && (
                    <span className="muted count"> ({track.userRatingCount})</span>
                  )}
                </td>
                <td className="col-score">{mine == null ? '—' : mine.toFixed(0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { fetchTrack } from '../lib/api';

/**
 * A song has no page of its own — it lives on the release it was published on,
 * even when that release is just the single. This resolves the track to that
 * collection and hands off to the album page with the track pre-selected.
 */
export default function TrackPage() {
  const { id = '' } = useParams();
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setTarget(null);
    setFailed(false);
    fetchTrack(id, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) {
          setTarget(`/album/${r.itunesCollectionId}?track=${r.itunesTrackId}`);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [id]);

  if (failed) return <Navigate to="/" replace />;
  if (target) return <Navigate to={target} replace />;

  return (
    <div className="container" style={{ padding: '48px 24px' }}>
      <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />
    </div>
  );
}

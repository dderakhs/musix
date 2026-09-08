import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import {
  deleteRating,
  fetchAggregateScores,
  fetchMyRatings,
  saveRating,
  type AggregateScore,
} from './ratings';

interface Options {
  trackIds: string[];
  /** Called with fresh community aggregates after a write, to patch the graph. */
  onAggregates: (updates: Map<string, AggregateScore>) => void;
}

/**
 * Owns "what has this user rated" plus the write path. Ratings go straight to
 * Supabase; after each write the affected track's community aggregate is
 * re-read so the user-score line moves immediately.
 */
export function useRatingSurface({ trackIds, onAggregates }: Options) {
  const { user } = useAuth();
  const [myRatings, setMyRatings] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = trackIds.join(',');

  useEffect(() => {
    if (!user) {
      setMyRatings(new Map());
      return;
    }
    let active = true;
    fetchMyRatings(user.id, key ? key.split(',') : [])
      .then((map) => {
        if (active) setMyRatings(map);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your ratings.');
      });
    return () => {
      active = false;
    };
  }, [user, key]);

  const refreshAggregate = useCallback(
    async (trackId: string) => {
      const updates = await fetchAggregateScores([trackId]);
      // A cleared rating can leave a track with no rows at all; make that explicit
      // so the caller resets the value instead of keeping a stale one.
      if (!updates.has(trackId)) {
        updates.set(trackId, { userScore: null, userRatingCount: 0 });
      }
      onAggregates(updates);
    },
    [onAggregates],
  );

  const rate = useCallback(
    async (trackId: string, score: number) => {
      if (!user) return;
      setSaving(true);
      setError(null);
      const previous = myRatings;
      setMyRatings(new Map(previous).set(trackId, score));
      try {
        await saveRating(user.id, trackId, score);
        await refreshAggregate(trackId);
      } catch (err) {
        setMyRatings(previous);
        setError(err instanceof Error ? err.message : 'Could not save your rating.');
      } finally {
        setSaving(false);
      }
    },
    [user, myRatings, refreshAggregate],
  );

  const clear = useCallback(
    async (trackId: string) => {
      if (!user) return;
      setSaving(true);
      setError(null);
      const previous = myRatings;
      const next = new Map(previous);
      next.delete(trackId);
      setMyRatings(next);
      try {
        await deleteRating(user.id, trackId);
        await refreshAggregate(trackId);
      } catch (err) {
        setMyRatings(previous);
        setError(err instanceof Error ? err.message : 'Could not remove your rating.');
      } finally {
        setSaving(false);
      }
    },
    [user, myRatings, refreshAggregate],
  );

  return { myRatings, rate, clear, saving, error, canRate: Boolean(user) };
}

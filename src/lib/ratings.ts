/**
 * Ratings live in Supabase and are written straight from the browser under the
 * signed-in user's JWT — RLS enforces that a row's user_id is the caller's own.
 * The serverless API is not in this path; it only owns the catalogue tables.
 */
import { supabase } from './supabase';

export interface AggregateScore {
  userScore: number | null;
  userRatingCount: number;
}

/** Postgres refuses an empty `IN ()`, and an empty request is pointless anyway. */
const nonEmpty = (ids: string[]) => ids.filter(Boolean);

export async function fetchMyRatings(
  userId: string,
  trackIds: string[],
): Promise<Map<string, number>> {
  const ids = nonEmpty(trackIds);
  if (!supabase || ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('ratings')
    .select('track_id, score')
    .eq('user_id', userId)
    .in('track_id', ids);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.track_id as string, Number(r.score)]));
}

/** Community aggregate — the mean of every musix member's rating for a track. */
export async function fetchAggregateScores(
  trackIds: string[],
): Promise<Map<string, AggregateScore>> {
  const ids = nonEmpty(trackIds);
  if (!supabase || ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('track_user_scores')
    .select('track_id, user_score, user_rating_count')
    .in('track_id', ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((r) => [
      r.track_id as string,
      {
        userScore: r.user_score == null ? null : Number(r.user_score),
        userRatingCount: Number(r.user_rating_count ?? 0),
      },
    ]),
  );
}

export async function saveRating(userId: string, trackId: string, score: number): Promise<void> {
  if (!supabase) throw new Error('Ratings are unavailable: Supabase is not configured.');
  const { error } = await supabase
    .from('ratings')
    .upsert({ user_id: userId, track_id: trackId, score }, { onConflict: 'user_id,track_id' });
  if (error) throw new Error(error.message);
}

export async function deleteRating(userId: string, trackId: string): Promise<void> {
  if (!supabase) throw new Error('Ratings are unavailable: Supabase is not configured.');
  const { error } = await supabase
    .from('ratings')
    .delete()
    .eq('user_id', userId)
    .eq('track_id', trackId);
  if (error) throw new Error(error.message);
}

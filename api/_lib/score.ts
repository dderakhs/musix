/**
 * The public score.
 *
 * musix shows two numbers per track:
 *
 *   userScore   — the mean of musix members' own 1-10 ratings. Ours, exact,
 *                 computed in Postgres (see the `track_user_scores` view).
 *
 *   publicScore — an aggregate of what the wider public thinks, assembled from
 *                 the free APIs below.
 *
 * An honest caveat, surfaced in the UI as well as here: no free, keyless API
 * publishes per-track *critic* review scores. Metacritic, Pitchfork and AOTY
 * have no open API and their terms forbid scraping. So `publicScore` is a
 * composite of the public signals that *are* openly available:
 *
 *   - MusicBrainz community star ratings (real votes, per recording and per
 *     release group) — the closest thing to a public review score, weighted by
 *     how many people voted;
 *   - Deezer play-rank and Last.fm playcounts — reception by listening, mapped
 *     through a logistic curve onto the same 0-10 scale.
 *
 * Every contributing signal is stored alongside the score in
 * `tracks.public_score_sources`, so the UI can show its work and nobody has to
 * take the number on faith.
 */

export interface ScoreSignal {
  /** Stable id shown in the score breakdown UI. */
  source: 'musicbrainz_recording' | 'musicbrainz_release_group' | 'deezer_rank' | 'lastfm_plays';
  label: string;
  /** Contribution on the shared 0-10 scale. */
  score: number;
  /** Relative influence on the weighted mean. */
  weight: number;
  /** Raw upstream figure, for transparency in the breakdown. */
  detail: Record<string, number | string | null>;
}

export interface PublicScore {
  score: number | null;
  signals: ScoreSignal[];
  /** 0-1: how much evidence backs the score. Drives the confidence dot in the UI. */
  confidence: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Map a raw popularity count onto 0-10 with a logistic curve over its order of
 * magnitude. Linear scaling is useless here: play counts span six decades, so a
 * handful of megahits would flatten everything else onto the floor.
 *
 * @param midpoint  log10(count) that should score 5/10.
 * @param steepness how sharply the curve turns; higher spreads the extremes.
 */
export function popularityToScore(count: number, midpoint: number, steepness: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const magnitude = Math.log10(count);
  return round2(clamp(10 / (1 + Math.exp(-(magnitude - midpoint) * steepness)), 0, 10));
}

/** MusicBrainz votes are 0-5 stars; the score scale is 0-10. */
const starsToScore = (stars: number) => round2(clamp(stars * 2, 0, 10));

/**
 * Vote-count weighting. One vote should barely move the needle; five or more is
 * treated as a settled community opinion.
 */
const voteConfidence = (votes: number) => clamp(votes / 5, 0, 1);

export interface ScoreInputs {
  /** MusicBrainz rating for this specific recording. */
  recordingRating?: { value: number; votes: number } | null;
  /** MusicBrainz rating for the parent release group, used as a weak prior. */
  releaseGroupRating?: { value: number; votes: number } | null;
  /** Deezer track rank, roughly 0-1,000,000. */
  deezerRank?: number | null;
  /** Last.fm playcount for the track. */
  lastfmPlays?: number | null;
}

/**
 * Weighted mean of whatever signals are present. Weights encode how much each
 * source tells us about *reception* specifically: a direct community vote on
 * the track beats an album-level vote, which beats raw popularity.
 */
export function computePublicScore(inputs: ScoreInputs): PublicScore {
  const signals: ScoreSignal[] = [];

  if (inputs.recordingRating && inputs.recordingRating.votes > 0) {
    const { value, votes } = inputs.recordingRating;
    signals.push({
      source: 'musicbrainz_recording',
      label: 'MusicBrainz community rating',
      score: starsToScore(value),
      weight: round2(3 * voteConfidence(votes)),
      detail: { stars: value, votes },
    });
  }

  if (inputs.releaseGroupRating && inputs.releaseGroupRating.votes > 0) {
    const { value, votes } = inputs.releaseGroupRating;
    signals.push({
      source: 'musicbrainz_release_group',
      label: 'MusicBrainz album rating',
      score: starsToScore(value),
      weight: round2(1.2 * voteConfidence(votes)),
      detail: { stars: value, votes },
    });
  }

  if (typeof inputs.deezerRank === 'number' && inputs.deezerRank > 0) {
    // Deezer ranks cluster in the 10^5-10^6 band, so 10^5 is the sensible
    // midpoint for "averagely popular".
    signals.push({
      source: 'deezer_rank',
      label: 'Deezer listener rank',
      score: popularityToScore(inputs.deezerRank, 5, 1.6),
      weight: 1,
      detail: { rank: inputs.deezerRank },
    });
  }

  if (typeof inputs.lastfmPlays === 'number' && inputs.lastfmPlays > 0) {
    // Scrobble counts run an order of magnitude higher than Deezer ranks.
    signals.push({
      source: 'lastfm_plays',
      label: 'Last.fm scrobbles',
      score: popularityToScore(inputs.lastfmPlays, 6, 1.4),
      weight: 1,
      detail: { playcount: inputs.lastfmPlays },
    });
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0) return { score: null, signals, confidence: 0 };

  const weighted = signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;

  // Full confidence needs a real community vote plus corroborating popularity;
  // popularity alone tops out partway.
  const hasVotes = signals.some((s) => s.source.startsWith('musicbrainz'));
  const confidence = round2(clamp(totalWeight / (hasVotes ? 4.2 : 2), 0, 1));

  return { score: round2(clamp(weighted, 0, 10)), signals, confidence };
}

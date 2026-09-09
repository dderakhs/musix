/**
 * The public score.
 *
 * musix shows two numbers per track:
 *
 *   userScore   — the mean of musix members' own 1-10 ratings. Ours, exact,
 *                 computed in Postgres (see the `track_user_scores` view).
 *
 *   publicScore — how the wider public has actually received the track,
 *                 assembled from the free APIs below.
 *
 * An honest caveat, surfaced in the UI as well as here: no free, keyless API
 * publishes per-track *critic* review scores. Metacritic, Pitchfork and AOTY
 * have no open API and their terms forbid scraping. So `publicScore` is a
 * composite of two things that are openly measurable — how well a track is
 * *rated* (MusicBrainz community votes) and how much attention it actually
 * commands (lyrics pageviews, streaming rank, scrobbles, discussion).
 *
 * Attention is weighted about twice as heavily as votes. That is deliberate:
 * community star ratings are sparse and skew towards older, canonical records,
 * so on anything recent they are close to silent, while a track everybody is
 * playing and talking about is unambiguous evidence of reception. A huge song
 * should read as a huge song.
 *
 * Every contributing signal is stored alongside the score in
 * `tracks.public_score_sources`, so the UI can show its work.
 */

/* ------------------------------------------------------------------ tuning
 * All the judgement calls live here so they can be adjusted in one place.
 *
 * `weight` is a signal's influence on the weighted mean. `midpoint` is the
 * log10 of the raw count that should score 5/10, and `steepness` how sharply
 * the curve turns — see `popularityToScore`.
 */
export const TUNING = {
  weights: {
    /** Direct community votes on this recording. Scaled by how many voted. */
    musicbrainzRecording: 2.5,
    /** Album-level votes, a weak prior for tracks with none of their own. */
    musicbrainzReleaseGroup: 1.0,
    /**
     * Spotify's own popularity index. The heaviest weight in the model because
     * it is the only signal already normalised across the whole catalogue —
     * every other source has to be corrected for era, genre or platform reach
     * before it can be compared to anything else.
     */
    spotifyPopularity: 3.5,
    /** Lyrics pageviews: the sharpest per-track attention signal available. */
    geniusPageviews: 2.5,
    /** Streaming rank. Demoted once Spotify is available: it measures the same
     *  thing more crudely and with a heavier bias towards recent releases. */
    deezerRank: 1.5,
    /** Scrobbles: broad, but under-counts recent releases and rap especially. */
    lastfmPlays: 1.5,
    /** Discussion volume. Keyword search, so deliberately modest. */
    redditPosts: 1.0,
  },
  curves: {
    /**
     * Deezer's `rank` is a bounded 0-1,000,000 index, but it is nowhere near
     * uniform over that range: the catalogue is overwhelmingly bunched at the
     * bottom and only a handful of global smashes ever approach the ceiling.
     * Curving over the *linear* share of the range therefore assumes a spread
     * that does not exist, and squashes the entire real distribution into the
     * lower half of the scale — a rank of 225k, which is genuinely deep into
     * the popular tail, came out at 4.4 rather than the 8.8 it deserves. So
     * this curves over the order of magnitude, like every other count-based
     * signal here, with the midpoint set where the mass actually sits.
     */
    deezerRank: { midpoint: 4.7, steepness: 3.05 },
    /**
     * How a track sits within its own artist's catalogue, as a share of their
     * peak. The gentler exponent is the point: within one artist, the gap
     * between a hit and a loved album cut is far smaller than raw play counts
     * suggest.
     */
    catalogueShare: { exponent: 0.4 },
    /** Spotify popularity is a 0-100 index, so it curves over its own range. */
    spotifyPopularity: { exponent: 0.6 },
    lastfmPlays: { midpoint: 4.6, steepness: 1.5 },
    geniusPageviews: { midpoint: 5.2, steepness: 2.0 },
    // Post counts are small numbers; ten posts is already real discussion.
    redditPosts: { midpoint: 0.85, steepness: 1.9 },
  },
  /** Votes needed before a community rating counts at full weight. */
  votesForFullConfidence: 5,
  /**
   * Exponent for combining the popularity signals. Above 1 this leans towards
   * the strongest evidence instead of averaging towards the middle.
   *
   * This matters more than it looks. The popularity sources all proxy the same
   * latent thing — attention — but each under-counts a different slice: Last.fm
   * badly under-represents recent rap, Genius has nothing for instrumentals,
   * Reddit misses non-English music. A plain mean lets whichever source is
   * blindest drag a genuinely huge track down to mediocre, which is exactly the
   * failure this is here to prevent. The least-underestimating source is the
   * most informative one, so the blend leans its way.
   */
  popularityExponent: 3,
  /**
   * How much of the streaming signal comes from where a track sits in its own
   * artist's catalogue, versus its absolute play rank.
   *
   * This matters more than any weight in the model. Deezer's rank is a measure
   * of *current* streaming, so it reads recency as quality: an eleven-year-old
   * classic scores below a forgettable new release, and every track on an older
   * record collapses into the bottom tier together. Judging a track against its
   * own artist's peak removes both that age bias and the head start a famous
   * name gets, which is what stops a beloved album cut being called garbage.
   */
  catalogueRelativeShare: 0.65,
  /**
   * Additive bonus for a sales certification, applied after the blend.
   *
   * A certification is the one piece of hard, audited evidence of scale in the
   * whole model — it is not a proxy for reach, it is a measured floor on it. A
   * diamond record is a different order of thing from a merely popular one and
   * the number should say so, which averaging alone will not do.
   */
  certificationPull: {
    diamond: 0.35,
    multi_platinum: 0.22,
    platinum: 0.12,
    gold: 0.05,
  },
} as const;

export type Certification = keyof typeof TUNING.certificationPull;

export interface ScoreSignal {
  source:
    | 'musicbrainz_recording'
    | 'musicbrainz_release_group'
    | 'spotify_popularity'
    | 'genius_pageviews'
    | 'deezer_rank'
    | 'lastfm_plays'
    | 'reddit_posts'
    | 'certification';
  label: string;
  /** What this signal measures: a rating, or raw attention. */
  kind: 'rating' | 'popularity';
  /** Contribution on the shared 0-10 scale. */
  score: number;
  /** Relative influence on the weighted mean. */
  weight: number;
  /** Raw upstream figures, for transparency in the breakdown. */
  detail: Record<string, number | string | null>;
}

export interface PublicScore {
  score: number | null;
  signals: ScoreSignal[];
  /** 0-1: how much evidence backs the score. Drives the confidence readout. */
  confidence: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Map a raw popularity count onto 0-10 with a logistic curve over its order of
 * magnitude. Linear scaling is useless here: these counts span six decades, so
 * a handful of megahits would flatten everything else onto the floor.
 */
export function popularityToScore(count: number, midpoint: number, steepness: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const magnitude = Math.log10(count);
  return round2(clamp(10 / (1 + Math.exp(-(magnitude - midpoint) * steepness)), 0, 10));
}

/**
 * Deezer's bounded rank, curved over its order of magnitude.
 *
 * The bound is real but misleading: ranks are concentrated at the low end, so
 * what matters is where a track sits in that skewed distribution, not what
 * fraction of 1,000,000 it reached. 50k is middling, 225k is a hit, and
 * everything past ~500k is a smash separated only by hairs — which is what
 * this curve says and a linear-share curve does not.
 */
export function rankToScore(rank: number, midpoint: number, steepness: number): number {
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  return popularityToScore(rank, midpoint, steepness);
}

/**
 * The streaming signal: absolute play rank blended with where the track sits in
 * its own artist's catalogue. Without the artist's peak there is nothing to be
 * relative to, so it falls back to the absolute reading.
 */
export function streamingScore(rank: number, artistPeakRank: number | null): number {
  const { midpoint, steepness } = TUNING.curves.deezerRank;
  const absolute = rankToScore(rank, midpoint, steepness);
  if (!artistPeakRank || artistPeakRank <= 0) return absolute;

  // The artist's own peak sets the ceiling; the track is placed beneath it by
  // its share of that peak.
  const ceiling = rankToScore(artistPeakRank, midpoint, steepness);
  const share = clamp(rank / artistPeakRank, 0, 1);
  const relative = ceiling * share ** TUNING.curves.catalogueShare.exponent;

  const w = TUNING.catalogueRelativeShare;
  return round2(clamp(relative * w + absolute * (1 - w), 0, 10));
}

/** MusicBrainz votes are 0-5 stars; the score scale is 0-10. */
const starsToScore = (stars: number) => round2(clamp(stars * 2, 0, 10));

/** One vote should barely move the needle; a handful is a settled opinion. */
const voteConfidence = (votes: number) =>
  clamp(votes / TUNING.votesForFullConfidence, 0, 1);

export interface ScoreInputs {
  recordingRating?: { value: number; votes: number } | null;
  releaseGroupRating?: { value: number; votes: number } | null;
  /** Spotify track popularity, 0-100. */
  spotifyPopularity?: number | null;
  /** Genius lyrics pageviews for the track. */
  geniusPageviews?: number | null;
  /** Deezer track rank, roughly 0-1,000,000. */
  deezerRank?: number | null;
  /**
   * The artist's own highest-ranked track. When known, the track is scored
   * against its maker's catalogue rather than against all recorded music.
   */
  artistPeakRank?: number | null;
  /** Last.fm playcount for the track. */
  lastfmPlays?: number | null;
  /** Reddit posts mentioning the track, and their combined upvotes. */
  reddit?: { posts: number; upvotes: number } | null;
  /** Highest sales certification on record for the track, if any. */
  certification?: Certification | null;
}

export function computePublicScore(inputs: ScoreInputs): PublicScore {
  const { weights, curves } = TUNING;
  const signals: ScoreSignal[] = [];

  if (inputs.recordingRating && inputs.recordingRating.votes > 0) {
    const { value, votes } = inputs.recordingRating;
    signals.push({
      source: 'musicbrainz_recording',
      label: 'MusicBrainz community rating',
      kind: 'rating',
      score: starsToScore(value),
      weight: round2(weights.musicbrainzRecording * voteConfidence(votes)),
      detail: { stars: value, votes },
    });
  }

  if (inputs.releaseGroupRating && inputs.releaseGroupRating.votes > 0) {
    const { value, votes } = inputs.releaseGroupRating;
    signals.push({
      source: 'musicbrainz_release_group',
      label: 'MusicBrainz album rating',
      kind: 'rating',
      score: starsToScore(value),
      weight: round2(weights.musicbrainzReleaseGroup * voteConfidence(votes)),
      detail: { stars: value, votes },
    });
  }

  if (typeof inputs.spotifyPopularity === 'number' && inputs.spotifyPopularity > 0) {
    signals.push({
      source: 'spotify_popularity',
      label: 'Spotify popularity',
      kind: 'popularity',
      score: round2(
        clamp(10 * (inputs.spotifyPopularity / 100) ** curves.spotifyPopularity.exponent, 0, 10),
      ),
      weight: weights.spotifyPopularity,
      detail: { popularity: inputs.spotifyPopularity },
    });
  }

  if (typeof inputs.geniusPageviews === 'number' && inputs.geniusPageviews > 0) {
    signals.push({
      source: 'genius_pageviews',
      label: 'Genius lyrics pageviews',
      kind: 'popularity',
      score: popularityToScore(
        inputs.geniusPageviews,
        curves.geniusPageviews.midpoint,
        curves.geniusPageviews.steepness,
      ),
      weight: weights.geniusPageviews,
      detail: { pageviews: inputs.geniusPageviews },
    });
  }

  if (typeof inputs.deezerRank === 'number' && inputs.deezerRank > 0) {
    signals.push({
      source: 'deezer_rank',
      label: 'Deezer listener rank',
      kind: 'popularity',
      score: streamingScore(inputs.deezerRank, inputs.artistPeakRank ?? null),
      weight: weights.deezerRank,
      detail: {
        rank: inputs.deezerRank,
        artistPeak: inputs.artistPeakRank ?? null,
        catalogueShare: inputs.artistPeakRank
          ? round2(inputs.deezerRank / inputs.artistPeakRank)
          : null,
      },
    });
  }

  if (typeof inputs.lastfmPlays === 'number' && inputs.lastfmPlays > 0) {
    signals.push({
      source: 'lastfm_plays',
      label: 'Last.fm scrobbles',
      kind: 'popularity',
      score: popularityToScore(
        inputs.lastfmPlays,
        curves.lastfmPlays.midpoint,
        curves.lastfmPlays.steepness,
      ),
      weight: weights.lastfmPlays,
      detail: { playcount: inputs.lastfmPlays },
    });
  }

  if (inputs.reddit && inputs.reddit.posts > 0) {
    signals.push({
      source: 'reddit_posts',
      label: 'Reddit discussion',
      kind: 'popularity',
      score: popularityToScore(
        inputs.reddit.posts,
        curves.redditPosts.midpoint,
        curves.redditPosts.steepness,
      ),
      weight: weights.redditPosts,
      detail: { posts: inputs.reddit.posts, upvotes: inputs.reddit.upvotes },
    });
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0) return { score: null, signals, confidence: 0 };

  // Attention signals are combined with a power mean so an under-measuring
  // source cannot drag a genuinely popular track down; ratings are a plain
  // weighted mean, since a vote is a vote. The two groups are then blended by
  // their summed weights.
  const popularity = signals.filter((s) => s.kind === 'popularity');
  const ratings = signals.filter((s) => s.kind === 'rating');

  const popularityWeight = popularity.reduce((sum, s) => sum + s.weight, 0);
  const ratingWeight = ratings.reduce((sum, s) => sum + s.weight, 0);

  const p = TUNING.popularityExponent;
  const popularityScore =
    popularityWeight > 0
      ? (popularity.reduce((sum, s) => sum + s.weight * s.score ** p, 0) / popularityWeight) **
        (1 / p)
      : 0;
  const ratingScore =
    ratingWeight > 0
      ? ratings.reduce((sum, s) => sum + s.weight * s.score, 0) / ratingWeight
      : 0;

  const blended =
    (popularityScore * popularityWeight + ratingScore * ratingWeight) /
    (popularityWeight + ratingWeight);

  // Applied as a pull towards 10 rather than a flat addition. Adding a constant
  // sends every certified track to the ceiling and destroys the ordering among
  // them; a proportional pull lifts a mid-table record noticeably, nudges an
  // already-huge one, and never saturates.
  const pull = inputs.certification ? TUNING.certificationPull[inputs.certification] : 0;
  const weighted = blended + (10 - blended) * pull;

  // Confidence rewards corroboration: several independent sources agreeing is
  // worth more than one source shouting. Full marks needs roughly half the
  // available weight in play.
  const available =
    Object.values(weights).reduce((a, b) => a + b, 0) / 2;
  const confidence = round2(clamp(totalWeight / available, 0, 1));

  if (pull > 0 && inputs.certification) {
    signals.push({
      source: 'certification',
      label: `Certified ${inputs.certification.replace('_', ' ')}`,
      kind: 'rating',
      score: round2(clamp(weighted, 0, 10)),
      weight: 0,
      detail: { level: inputs.certification, lift: round2(weighted - blended) },
    });
  }

  return { score: round2(clamp(weighted, 0, 10)), signals, confidence };
}

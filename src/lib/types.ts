/** Shapes returned by the /api functions. Kept hand-written and narrow. */

export interface ScoreSignal {
  source: string;
  label: string;
  score: number;
  weight: number;
  detail: Record<string, number | string | null>;
}

export interface PublicScoreBreakdown {
  score: number | null;
  signals: ScoreSignal[];
  confidence: number;
}

export interface SearchArtist {
  itunesArtistId: number;
  name: string;
  genre: string | null;
}

export interface SearchAlbum {
  itunesCollectionId: number;
  itunesArtistId: number | null;
  title: string;
  artistName: string;
  releaseDate: string | null;
  genre: string | null;
  trackCount: number | null;
  albumType: string;
  coverUrl: string | null;
}

export interface SearchResponse {
  query: string;
  artists: SearchArtist[];
  albums: SearchAlbum[];
}

export interface Track {
  id: string | null;
  itunesTrackId?: number;
  albumId?: string;
  albumTitle?: string;
  title: string;
  discNumber: number;
  trackNumber: number;
  durationMs: number | null;
  previewUrl: string | null;
  explicit: boolean;
  publicScore: number | null;
  publicScoreSources: PublicScoreBreakdown | null;
  userScore: number | null;
  userRatingCount: number;
}

export interface Album {
  id: string | null;
  itunesCollectionId: number;
  itunesArtistId?: number | null;
  artistId?: string | null;
  title: string;
  artistName: string;
  releaseDate: string | null;
  genre: string | null;
  albumType: string;
  trackCount: number | null;
  coverUrl: string | null;
  coverUrlLarge?: string | null;
  mbReleaseGroupId?: string | null;
  publicScore: number | null;
  publicScoreSources?: PublicScoreBreakdown | null;
  /** Present on the artist discography payload. */
  tracksPublicScore?: number | null;
  tracksUserScore?: number | null;
  userRatingCount?: number;
  tracksLoaded?: number;
}

export interface AlbumResponse {
  album: Album;
  tracks: Track[];
  sources: { itunes: boolean; musicbrainz: boolean; deezer: boolean; lastfm: boolean };
}

export interface Artist {
  id: string | null;
  itunesArtistId: number;
  name: string;
  genre: string | null;
}

export interface ArtistResponse {
  artist: Artist;
  albums: Album[];
  tracks: Track[];
}

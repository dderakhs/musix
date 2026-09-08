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
  imageUrl: string | null;
  fans: number;
}

export interface SearchSong {
  itunesTrackId: number;
  itunesCollectionId: number;
  title: string;
  artistName: string;
  coverUrl: string | null;
  durationMs: number | null;
}

export interface ChartEntry {
  rank: number;
  itunesTrackId: number | null;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  releaseDate: string | null;
}

/** Factual song metadata for the hover preview: artwork and credits only. */
export interface TrackPreview {
  artUrl: string | null;
  releaseDate: string | null;
  producers: string[];
  writers: string[];
  geniusUrl: string | null;
}

export interface Comment {
  id: string;
  albumId: string;
  userId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  authorName: string;
  authorAvatar: string | null;
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
  songs: SearchSong[];
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
  preview?: TrackPreview | null;
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

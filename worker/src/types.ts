// The shapes the API returns. src/lib/api.ts in the site declares the same ones for the browser.

export interface NowPlaying {
  source: 'spotify' | 'listenbrainz';
  /** True while it's playing; false for the latest listen once nothing is */
  isPlaying: boolean;
  track: string;
  artist: string;
  album?: string;
  cover?: string | null;
  /** Where to open it; only Spotify tracks have one */
  url?: string;
  /** When it was listened to, in seconds; only for listens */
  playedAt?: number;
}

export interface Entry {
  name: string;
  /** The artist, for albums and tracks */
  by?: string;
  cover?: string | null;
  plays: number;
}

export interface Tallies {
  listens: number;
  artistCount: number;
  artists: Entry[];
  albums: Entry[];
  tracks: Entry[];
}

export interface Snapshot {
  user: string;
  /** When the oldest of the range counts was made, in seconds */
  fetchedAt: number;
  ranges: Record<'week' | 'month' | 'year', Tallies>;
}

export interface Env {
  DB: D1Database;
  LISTENBRAINZ_USER: string;
  ALLOWED_ORIGINS: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_REFRESH_TOKEN?: string;
  ADMIN_TOKEN?: string;
  // Everything below is optional: the defaults are the real services, and tests point these at fakes
  LISTENBRAINZ_API?: string;
  SPOTIFY_API?: string;
  SPOTIFY_ACCOUNTS?: string;
  SYNC_PAGE_SIZE?: string;
  SYNC_MAX_PAGES?: string;
}

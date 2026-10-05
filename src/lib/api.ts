// Talking to the Worker (worker/): what's playing right now, and the counts for Most Played.
// fetchJSON and ago come from prcutler/listenbrainz-widget (MIT); the license notice is in
// src/components/NowPlayingCard.tsx.
import { API_URL } from '../site';
import type { RangeId, Tallies } from './most-played';

/** What the Worker says is playing: from Spotify while it is, or else my latest ListenBrainz listen */
export interface NowPlaying {
  source: 'spotify' | 'listenbrainz';
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

/** The counts for each range, made by the Worker's cron job */
export interface Snapshot {
  user: string;
  /** When the counts were made, in seconds */
  fetchedAt: number;
  ranges: Record<RangeId, Tallies>;
}

/** How long to wait before giving up on a request; an outage still ends in a message rather than loading forever */
const TIMEOUT_MS = 20000;

export async function fetchJSON(url: string, timeoutMs = TIMEOUT_MS) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function endpoint(path: string) {
  if (!API_URL) throw new Error('PUBLIC_API_URL is not set, so there is no Worker to ask');
  return new URL(path, API_URL).toString();
}

/** What's playing, or null when there's nothing to show yet */
export async function getNowPlaying(): Promise<NowPlaying | null> {
  const data = await fetchJSON(endpoint('/now-playing'));
  return data.nowPlaying ?? null;
}

export async function getMostPlayed(): Promise<Snapshot> {
  const data = await fetchJSON(endpoint('/most-played'));
  if (!data?.ranges) throw new Error('No counts yet');
  return data;
}

/** "45s ago", "3h ago", "2d ago", or the date once it's a week or more */
export function ago(timestamp?: number) {
  if (!timestamp) return '';
  const s = Math.max(1, Math.floor(Date.now() / 1000 - timestamp));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

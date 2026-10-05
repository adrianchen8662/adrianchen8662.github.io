// ListenBrainz API helpers shared by the About page's cards and the snapshot made at build time.
// fetchJSON, coverUrl and ago come from prcutler/listenbrainz-widget (MIT); the license notice is in
// src/components/ListenBrainzCard.tsx.
import type { RangeId, Tallies } from './most-played';

export const API = 'https://api.listenbrainz.org/1';

export interface TrackMetadata {
  track_name?: string;
  artist_name?: string;
  release_name?: string;
  mbid_mapping?: {
    caa_release_mbid?: string;
    caa_id?: number;
    release_mbid?: string;
    artists?: { artist_credit_name: string }[];
  };
  additional_info?: { release_mbid?: string; artist_names?: string[]; release_artist_name?: string };
}

export interface Listen {
  listened_at?: number;
  track_metadata?: TrackMetadata;
}

/**
 * How long to wait for ListenBrainz before giving up on a request. It's generous because the API
 * can be slow under heavy traffic; an outage still ends in a message rather than loading forever.
 */
const TIMEOUT_MS = 60000;

export async function fetchJSON(url: string, timeoutMs = TIMEOUT_MS) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function coverUrl(meta: TrackMetadata) {
  const m = meta.mbid_mapping ?? {};
  if (m.caa_release_mbid && m.caa_id != null) {
    return `https://archive.org/download/mbid-${m.caa_release_mbid}/mbid-${m.caa_release_mbid}-${m.caa_id}_thumb250.jpg`;
  }
  const release = m.release_mbid ?? meta.additional_info?.release_mbid;
  return release ? `https://coverartarchive.org/release/${release}/front-250` : null;
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

export const playedAt = (listen: Listen) => listen.listened_at ?? 0;

const PAGE_SIZE = 1000; // the most listens ListenBrainz returns at once
const MAX_PAGES = 25;

/**
 * Every listen after `after`, and up to `before` if given, newest first.
 * ListenBrainz answers min_ts with the oldest listens after it, so this pages forward from there.
 */
export async function fetchListens(
  username: string,
  after: number,
  before?: number,
  onProgress?: (count: number) => void,
) {
  const all: Listen[] = [];
  let since = after;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ min_ts: String(since), count: String(PAGE_SIZE) });
    if (before !== undefined) params.set('max_ts', String(before + 1));
    const data = await fetchJSON(`${API}/user/${encodeURIComponent(username)}/listens?${params}`);
    const listens: Listen[] = data.payload?.listens ?? [];
    all.push(...listens);
    onProgress?.(all.length);
    if (listens.length < PAGE_SIZE) break;
    since = Math.max(...listens.map(playedAt));
  }
  // Newest first, so ties in the counts go to whatever was played more recently
  return all.sort((a, b) => playedAt(b) - playedAt(a));
}

/** What the site publishes at /listenbrainz.json when it's built (see src/pages/listenbrainz.json.ts) */
export interface Snapshot {
  user: string;
  /** When the listens were fetched, in seconds */
  fetchedAt: number;
  /** Most played, counted for each range */
  ranges: Record<RangeId, Tallies>;
}

export const SNAPSHOT_PATH = '/listenbrainz.json';

let snapshot: Promise<Snapshot | null> | undefined;

/**
 * The snapshot published with the site, or null when there isn't one (local builds publish an empty
 * file) or it can't be loaded. It's fetched once per page, however many cards ask for it.
 */
export async function loadSnapshot(username: string) {
  snapshot ??= fetchJSON(SNAPSHOT_PATH, 10000)
    .then((data) => (data?.ranges ? (data as Snapshot) : null))
    .catch(() => null);
  const loaded = await snapshot;
  return loaded?.user === username ? loaded : null;
}

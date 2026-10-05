// Keeps D1 up to date with my ListenBrainz listens. coverUrl comes from prcutler/listenbrainz-widget (MIT);
// the license notice is in src/components/NowPlayingCard.tsx in the site.
import { earliestStart } from './ranges.ts';
import type { Env } from './types.ts';

interface LBMeta {
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

export interface LBListen {
  listened_at?: number;
  track_metadata?: LBMeta;
}

/** A listen as stored in the `listens` table */
export interface ListenRow {
  listened_at: number;
  track: string;
  artist: string;
  album: string;
  album_artist: string;
  /** JSON array of every artist credited on the track */
  artists: string;
  cover: string | null;
}

export function coverUrl(meta: LBMeta) {
  const m = meta.mbid_mapping ?? {};
  if (m.caa_release_mbid && m.caa_id != null) {
    return `https://archive.org/download/mbid-${m.caa_release_mbid}/mbid-${m.caa_release_mbid}-${m.caa_id}_thumb250.jpg`;
  }
  const release = m.release_mbid ?? meta.additional_info?.release_mbid;
  return release ? `https://coverartarchive.org/release/${release}/front-250` : null;
}

/** null for a listen with no time, which is how ListenBrainz reports what's playing right now */
export function toRow(listen: LBListen): ListenRow | null {
  const listenedAt = listen.listened_at;
  if (!listenedAt) return null;
  const meta = listen.track_metadata ?? {};
  const artist = meta.artist_name ?? 'Unknown artist';
  // Every artist credited on a track gets the play, as in ListenBrainz's stats
  const credited = [meta.additional_info?.artist_names, meta.mbid_mapping?.artists?.map((a) => a.artist_credit_name)]
    .find((names) => names?.length) ?? [artist];
  // Once each, whatever the case, keeping the first spelling
  const seen = new Set<string>();
  const artists = credited.filter((name) => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()));
  return {
    listened_at: listenedAt,
    track: meta.track_name ?? '',
    artist,
    album: meta.release_name ?? '',
    album_artist: meta.additional_info?.release_artist_name ?? artist,
    artists: JSON.stringify(artists),
    cover: coverUrl(meta),
  };
}

// One statement for a whole page of listens: the rows travel as a single JSON parameter, which sidesteps
// D1's limit on bound parameters, and a page costs one query against the free plan's per-run allowance.
const INSERT = `
  INSERT OR IGNORE INTO listens (listened_at, track, artist, album, album_artist, artists, cover)
  SELECT json_extract(value, '$.listened_at'), json_extract(value, '$.track'), json_extract(value, '$.artist'),
         json_extract(value, '$.album'), json_extract(value, '$.album_artist'), json_extract(value, '$.artists'),
         json_extract(value, '$.cover')
  FROM json_each(?1)`;

const number = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export async function setState(db: D1Database, key: string, value: string) {
  await db
    .prepare('INSERT INTO state (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

/**
 * Adds the listens ListenBrainz has that D1 doesn't, oldest first, and returns how many were new. It stops
 * after a few pages so a run stays inside the free plan's limits; the first run (or one after a long outage)
 * just carries on from where the last stopped, 15 minutes later.
 */
export async function syncListens(env: Env, now = Math.floor(Date.now() / 1000)) {
  const pageSize = number(env.SYNC_PAGE_SIZE, 200);
  const maxPages = number(env.SYNC_MAX_PAGES, 6);
  const api = env.LISTENBRAINZ_API ?? 'https://api.listenbrainz.org/1';

  const stored = await env.DB.prepare('SELECT MAX(listened_at) AS newest FROM listens').first<{ newest: number | null }>();
  // min_ts is exclusive and ListenBrainz answers it with the oldest listens after it, so this pages forward.
  // Starting one second early re-reads the newest listen, which the primary key ignores, and so can't skip
  // another listen from the same second.
  let progress = stored?.newest ?? earliestStart(now);
  let since = stored?.newest ? stored.newest - 1 : progress;
  let added = 0;
  let pages = 0;

  while (pages < maxPages) {
    pages++;
    const url = `${api}/user/${encodeURIComponent(env.LISTENBRAINZ_USER)}/listens?min_ts=${since}&count=${pageSize}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'site-api (https://adrianchen8662.github.io)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`ListenBrainz answered HTTP ${response.status}`);
    const data = (await response.json()) as { payload?: { listens?: LBListen[] } };
    const listens = data.payload?.listens ?? [];
    const rows = listens.map(toRow).filter((row) => row !== null);
    if (!rows.length) break;

    const result = await env.DB.prepare(INSERT).bind(JSON.stringify(rows)).run();
    added += result.meta.changes;

    if (listens.length < pageSize) break;
    // A full page that ends where the last one did (a whole page of listens in one second) can't be read
    // past with the overlap, so it steps over the rest of that second rather than asking for it forever
    const newest = Math.max(...rows.map((row) => row.listened_at));
    since = newest > progress ? newest - 1 : newest;
    progress = Math.max(progress, newest);
  }
  return { added, pages };
}

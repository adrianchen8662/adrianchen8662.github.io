// The Most Played counts: counted by D1 from the stored listens, kept in `snapshots` and served as they are.
import { RANGES, type RangeId } from './ranges.ts';
import type { Entry, Env, Snapshot, Tallies } from './types.ts';

const TOP = 5;
const MAX_AGE = 60 * 60;

// The spelling (and cover) an entry keeps is the one from its most recent listen: the newest value of
// `col` among the grouped rows, found by prefixing it with the time, padded so the text sorts like a number
const latest = (col: string, time = 'listened_at') => `substr(MAX(printf('%012d', ${time}) || ${col}), 13)`;

// Ties in the counts go to whatever was played more recently
const ranked = `ORDER BY plays DESC, MAX(listened_at) DESC LIMIT ${TOP}`;

function queries(db: D1Database, since: number) {
  const q = (sql: string) => db.prepare(sql).bind(since);
  return [
    q('SELECT COUNT(*) AS n FROM listens WHERE listened_at > ?1'),
    q('SELECT COUNT(DISTINCT lower(j.value)) AS n FROM listens l, json_each(l.artists) j WHERE l.listened_at > ?1'),
    q(`SELECT ${latest('j.value', 'l.listened_at')} AS name, COUNT(*) AS plays
       FROM listens l, json_each(l.artists) j WHERE l.listened_at > ?1
       GROUP BY lower(j.value) ORDER BY plays DESC, MAX(l.listened_at) DESC LIMIT ${TOP}`),
    q(`SELECT ${latest('album')} AS name, ${latest('album_artist')} AS "by",
              substr(MAX(CASE WHEN cover IS NOT NULL THEN printf('%012d', listened_at) || cover END), 13) AS cover,
              COUNT(*) AS plays
       FROM listens WHERE listened_at > ?1 AND album != ''
       GROUP BY lower(album), lower(album_artist) ${ranked}`),
    q(`SELECT ${latest('track')} AS name, ${latest('artist')} AS "by",
              substr(MAX(CASE WHEN cover IS NOT NULL THEN printf('%012d', listened_at) || cover END), 13) AS cover,
              COUNT(*) AS plays
       FROM listens WHERE listened_at > ?1 AND track != ''
       GROUP BY lower(track), lower(artist) ${ranked}`),
  ];
}

const QUERIES_PER_RANGE = 5;

async function tally(db: D1Database, now: number): Promise<Record<RangeId, Tallies>> {
  const results = await db.batch(RANGES.flatMap((range) => queries(db, range.start(now))));
  return Object.fromEntries(
    RANGES.map((range, i) => {
      const [total, artistCount, artists, albums, tracks] = results.slice(i * QUERIES_PER_RANGE, (i + 1) * QUERIES_PER_RANGE);
      const tallies: Tallies = {
        listens: (total.results[0] as { n: number }).n,
        artistCount: (artistCount.results[0] as { n: number }).n,
        artists: artists.results as unknown as Entry[],
        albums: albums.results as unknown as Entry[],
        tracks: tracks.results as unknown as Entry[],
      };
      return [range.id, tallies];
    }),
  ) as Record<RangeId, Tallies>;
}

/**
 * Counts and stores the ranges again if `force` (listens were just added), if they're missing, or if they're
 * an hour old, since the shorter ranges slide on without any new listens. Returns whether it counted.
 */
export async function refreshStats(env: Env, force: boolean, now = Math.floor(Date.now() / 1000)) {
  if (!force) {
    const stored = await env.DB.prepare('SELECT COUNT(*) AS n, MIN(computed_at) AS oldest FROM snapshots').first<{
      n: number;
      oldest: number | null;
    }>();
    if (stored && stored.n === RANGES.length && stored.oldest !== null && now - stored.oldest < MAX_AGE) return false;
  }
  const ranges = await tally(env.DB, now);
  await env.DB.batch(
    RANGES.map((range) =>
      env.DB
        .prepare(
          'INSERT INTO snapshots (range_id, body, computed_at) VALUES (?1, ?2, ?3) ON CONFLICT (range_id) DO UPDATE SET body = excluded.body, computed_at = excluded.computed_at',
        )
        .bind(range.id, JSON.stringify(ranges[range.id]), now),
    ),
  );
  return true;
}

/** The stored counts, or null until the first sync has made them */
export async function readStats(env: Env): Promise<Snapshot | null> {
  const { results } = await env.DB.prepare('SELECT range_id, body, computed_at FROM snapshots').all<{
    range_id: string;
    body: string;
    computed_at: number;
  }>();
  if (results.length !== RANGES.length) return null;
  const ranges = Object.fromEntries(results.map((row) => [row.range_id, JSON.parse(row.body)]));
  return {
    user: env.LISTENBRAINZ_USER,
    fetchedAt: Math.min(...results.map((row) => row.computed_at)),
    ranges: ranges as Snapshot['ranges'],
  };
}

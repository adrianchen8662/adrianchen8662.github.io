// The API behind adrianchen8662.github.io:
//   GET  /now-playing  what Spotify says I'm playing, or else my latest listen
//   GET  /most-played  the counts for the About page, made by the cron job
//   GET  /history      my listens, newest first (?limit=50&before=<seconds>)
//   GET  /status       when the last sync happened
//   POST /admin/sync   syncs by hand (needs the ADMIN_TOKEN secret)
import { syncListens, setState } from './listenbrainz.ts';
import { currentlyPlaying } from './spotify.ts';
import { readStats, refreshStats } from './stats.ts';
import type { Env, NowPlaying } from './types.ts';

interface Reply {
  status: number;
  body: unknown;
}

const json = (status: number, body: unknown): Reply => ({ status, body });

/** Answers shared by every visitor for a few seconds, so a busy page can't hammer Spotify or D1 */
const memo = new Map<string, { until: number; reply: Promise<Reply> }>();

function memoized(key: string, ttlSeconds: number, compute: () => Promise<Reply>) {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && hit.until > now) return hit.reply;
  const reply = compute().catch((error): Reply => {
    console.error(`${key}: ${error}`);
    return json(502, { error: 'Something went wrong' });
  });
  memo.set(key, { until: now + ttlSeconds * 1000, reply });
  // Errors aren't kept
  reply.then((r) => {
    if (r.status >= 400 && memo.get(key)?.reply === reply) memo.delete(key);
  });
  return reply;
}

async function latestListen(db: D1Database): Promise<NowPlaying | null> {
  const row = await db
    .prepare('SELECT listened_at, track, artist, album, cover FROM listens ORDER BY listened_at DESC LIMIT 1')
    .first<{ listened_at: number; track: string; artist: string; album: string; cover: string | null }>();
  if (!row) return null;
  return {
    source: 'listenbrainz',
    isPlaying: false,
    track: row.track || 'Unknown track',
    artist: row.artist,
    album: row.album || undefined,
    cover: row.cover,
    playedAt: row.listened_at,
  };
}

async function nowPlaying(env: Env): Promise<Reply> {
  let spotifyFailed = false;
  try {
    const playing = await currentlyPlaying(env);
    if (playing) return json(200, { nowPlaying: playing });
  } catch (error) {
    spotifyFailed = true;
    console.warn(`Spotify: ${error}`);
  }
  const last = await latestListen(env.DB);
  // Spotify down and nothing stored is an outage, not an empty history
  return last || !spotifyFailed ? json(200, { nowPlaying: last }) : json(502, { error: 'Nothing to show' });
}

async function mostPlayed(env: Env): Promise<Reply> {
  const stats = await readStats(env);
  return stats ? json(200, stats) : json(503, { error: 'The listening history is still being collected' });
}

async function history(env: Env, url: URL): Promise<Reply> {
  const limit = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get('limit'))) || 50));
  const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB
    .prepare('SELECT listened_at, track, artist, album, cover FROM listens WHERE listened_at < ?1 ORDER BY listened_at DESC LIMIT ?2')
    .bind(before, limit)
    .all<{ listened_at: number; track: string; artist: string; album: string; cover: string | null }>();
  const listens = results.map((row) => ({
    listenedAt: row.listened_at,
    track: row.track,
    artist: row.artist,
    album: row.album || null,
    cover: row.cover,
  }));
  return json(200, { listens, next: listens.length === limit ? listens[listens.length - 1].listenedAt : null });
}

async function status(env: Env): Promise<Reply> {
  const { results } = await env.DB.prepare("SELECT key, value FROM state WHERE key LIKE 'lb_%'").all<{ key: string; value: string }>();
  const state = Object.fromEntries(results.map((row) => [row.key, row.value]));
  const newest = await env.DB.prepare('SELECT MAX(listened_at) AS at FROM listens').first<{ at: number | null }>();
  const stats = await env.DB.prepare('SELECT MIN(computed_at) AS at FROM snapshots').first<{ at: number | null }>();
  return json(200, {
    listenbrainz: {
      lastSuccess: Number(state.lb_last_ok) || null,
      lastError: state.lb_last_error ?? null,
      newestListen: newest?.at ?? null,
    },
    statsComputedAt: stats?.at ?? null,
    spotifyConfigured: Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.SPOTIFY_REFRESH_TOKEN),
  });
}

/** One sync pass: new listens from ListenBrainz, then fresh counts. A ListenBrainz outage leaves D1 as it was. */
export async function runSync(env: Env) {
  let added = 0;
  let error: string | null = null;
  try {
    ({ added } = await syncListens(env));
    await setState(env.DB, 'lb_last_ok', String(Math.floor(Date.now() / 1000)));
    await env.DB.prepare("DELETE FROM state WHERE key = 'lb_last_error'").run();
  } catch (caught) {
    error = String(caught);
    console.error(`ListenBrainz sync failed: ${error}`);
    await setState(env.DB, 'lb_last_error', error).catch(() => {});
  }
  const counted = await refreshStats(env, added > 0);
  // Whatever was remembered from before the sync is out of date
  memo.clear();
  console.log(`Sync: ${added} new listens${error ? ', ListenBrainz failed' : ''}${counted ? ', counts refreshed' : ''}`);
  return { added, error, counted };
}

function corsHeaders(request: Request, env: Env) {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin && env.ALLOWED_ORIGINS.split(',').some((allowed) => allowed.trim() === origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

function respond(request: Request, env: Env, reply: Reply, ttlSeconds = 0) {
  const headers = corsHeaders(request, env);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', reply.status < 400 && ttlSeconds ? `public, max-age=${ttlSeconds}` : 'no-store');
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/admin/sync') {
    const given = request.headers.get('Authorization') ?? '';
    if (!env.ADMIN_TOKEN) return respond(request, env, json(404, { error: 'Not found' }));
    if (given !== `Bearer ${env.ADMIN_TOKEN}`) return respond(request, env, json(401, { error: 'Unauthorized' }));
    return respond(request, env, json(200, await runSync(env)));
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (request.method !== 'GET' && request.method !== 'HEAD') return respond(request, env, json(405, { error: 'Method not allowed' }));

  switch (url.pathname) {
    case '/now-playing':
      return respond(request, env, await memoized('now-playing', 10, () => nowPlaying(env)), 10);
    case '/most-played':
      return respond(request, env, await memoized('most-played', 60, () => mostPlayed(env)), 60);
    case '/history':
      return respond(request, env, await memoized(`history${url.search}`, 60, () => history(env, url)), 60);
    case '/status':
      return respond(request, env, await memoized('status', 10, () => status(env)), 10);
    default:
      return respond(request, env, json(404, { error: 'Not found' }));
  }
}

export default {
  fetch: handle,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runSync(env));
  },
} satisfies ExportedHandler<Env>;

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import worker from '../src/index.ts';
import { toNowPlaying, resetSpotify } from '../src/spotify.ts';
import { createEnv } from './d1.ts';
import type { Env } from '../src/types.ts';

const realFetch = globalThis.fetch;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;
let calls: string[];

function fakeNetwork(handler: Handler) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.host}${url.pathname}`);
    return handler(url, init);
  }) as typeof fetch;
}

const spotifyEnv = (overrides: Partial<Env> = {}) =>
  createEnv({
    SPOTIFY_CLIENT_ID: 'id',
    SPOTIFY_CLIENT_SECRET: 'secret',
    SPOTIFY_REFRESH_TOKEN: 'refresh',
    ...overrides,
  });

const playback = {
  is_playing: true,
  currently_playing_type: 'track',
  item: {
    name: 'Song',
    artists: [{ name: 'A' }, { name: 'B' }],
    album: { name: 'Record', images: [{ url: 'big', width: 640 }, { url: 'mid', width: 300 }, { url: 'small', width: 64 }] },
    external_urls: { spotify: 'https://open.spotify.com/track/1' },
  },
};

const spotify: Handler = (url) => {
  if (url.pathname === '/api/token') return Response.json({ access_token: 'access', expires_in: 3600 });
  return Response.json(playback);
};

// The worker remembers answers for a few seconds between requests; each test starts with a fresh worker
async function get(env: Env, path: string, headers: Record<string, string> = {}) {
  return worker.fetch(new Request(`https://api.test${path}`, { headers }), env);
}

async function freshWorker() {
  return (await import(`../src/index.ts?${Math.random()}`)).default as typeof worker;
}

beforeEach(() => resetSpotify());
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('toNowPlaying', () => {
  it('maps a track, picking the artwork nearest the card', () => {
    assert.deepEqual(toNowPlaying(playback), {
      source: 'spotify',
      isPlaying: true,
      track: 'Song',
      artist: 'A, B',
      album: 'Record',
      cover: 'mid',
      url: 'https://open.spotify.com/track/1',
    });
  });

  it('maps a podcast episode to its show', () => {
    const episode = toNowPlaying({
      is_playing: true,
      currently_playing_type: 'episode',
      item: { name: 'Episode 5', show: { name: 'The Show' }, images: [{ url: 'art', width: 300 }] },
    })!;
    assert.deepEqual([episode.track, episode.artist, episode.album, episode.cover], ['Episode 5', 'The Show', undefined, 'art']);
  });

  it('says nothing is playing when paused, between tracks or on an ad', () => {
    assert.equal(toNowPlaying({ ...playback, is_playing: false }), null);
    assert.equal(toNowPlaying({ is_playing: true, currently_playing_type: 'ad', item: null }), null);
    assert.equal(toNowPlaying({}), null);
  });

  it('copes with a local file, which has no artwork', () => {
    const local = toNowPlaying({ is_playing: true, item: { name: 'Mine', artists: [], album: { name: '', images: [] } } })!;
    assert.deepEqual([local.artist, local.album, local.cover], ['Unknown artist', undefined, null]);
  });
});

describe('GET /now-playing', () => {
  it('shows what Spotify says is playing', async () => {
    fakeNetwork(spotify);
    const response = await (await freshWorker()).fetch(new Request('https://api.test/now-playing'), spotifyEnv());
    const body = (await response.json()) as { nowPlaying: { track: string; isPlaying: boolean; source: string } };
    assert.equal(response.status, 200);
    assert.deepEqual([body.nowPlaying.track, body.nowPlaying.isPlaying, body.nowPlaying.source], ['Song', true, 'spotify']);
    assert.match(response.headers.get('Cache-Control')!, /max-age=10/);
  });

  it('falls back to the latest listen when nothing is playing', async () => {
    const env = spotifyEnv();
    await env.DB
      .prepare("INSERT INTO listens VALUES (100, 'Old Song', 'Old Band', 'Old Record', 'Old Band', '[\"Old Band\"]', NULL)")
      .run();
    fakeNetwork((url) => (url.pathname === '/api/token' ? Response.json({ access_token: 'a', expires_in: 3600 }) : new Response(null, { status: 204 })));
    const body = (await (await (await freshWorker()).fetch(new Request('https://api.test/now-playing'), env)).json()) as {
      nowPlaying: Record<string, unknown>;
    };
    assert.deepEqual(body.nowPlaying, {
      source: 'listenbrainz',
      isPlaying: false,
      track: 'Old Song',
      artist: 'Old Band',
      album: 'Old Record',
      cover: null,
      playedAt: 100,
    });
  });

  it('falls back to the latest listen when Spotify fails, and when it is not set up', async () => {
    for (const env of [spotifyEnv(), createEnv()]) {
      await env.DB.prepare("INSERT INTO listens VALUES (100, 'Song', 'Band', '', 'Band', '[\"Band\"]', NULL)").run();
      fakeNetwork(() => new Response('nope', { status: 500 }));
      const response = await (await freshWorker()).fetch(new Request('https://api.test/now-playing'), env);
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { nowPlaying: { source: string } }).nowPlaying.source, 'listenbrainz');
      resetSpotify();
    }
  });

  it('reports an error when Spotify fails and there is nothing stored, and null when there is truly nothing', async () => {
    fakeNetwork(() => new Response('nope', { status: 500 }));
    assert.equal((await (await freshWorker()).fetch(new Request('https://api.test/now-playing'), spotifyEnv())).status, 502);
    resetSpotify();
    fakeNetwork((url) => (url.pathname === '/api/token' ? Response.json({ access_token: 'a', expires_in: 3600 }) : new Response(null, { status: 204 })));
    const response = await (await freshWorker()).fetch(new Request('https://api.test/now-playing'), spotifyEnv());
    assert.deepEqual(await response.json(), { nowPlaying: null });
  });

  it('asks Spotify once for many visitors, and reuses its access token', async () => {
    fakeNetwork(spotify);
    const w = await freshWorker();
    const env = spotifyEnv();
    await Promise.all([1, 2, 3, 4].map(() => w.fetch(new Request('https://api.test/now-playing'), env)));
    assert.deepEqual(calls, ['POST accounts.spotify.com/api/token', 'GET api.spotify.com/v1/me/player/currently-playing']);
  });

  it('gets a new access token when Spotify says the old one expired', async () => {
    let attempts = 0;
    fakeNetwork((url) => {
      if (url.pathname === '/api/token') return Response.json({ access_token: `token-${calls.length}`, expires_in: 3600 });
      return attempts++ === 0 ? new Response('expired', { status: 401 }) : Response.json(playback);
    });
    const response = await (await freshWorker()).fetch(new Request('https://api.test/now-playing'), spotifyEnv());
    assert.equal(((await response.json()) as { nowPlaying: { source: string } }).nowPlaying.source, 'spotify');
    assert.equal(calls.filter((c) => c.includes('/api/token')).length, 2);
  });

  it('keeps a refresh token Spotify rotated, until the secret itself changes', async () => {
    const env = spotifyEnv();
    const bodies: string[] = [];
    fakeNetwork(async (url, init) => {
      if (url.pathname === '/api/token') {
        bodies.push(String(init?.body));
        return Response.json({ access_token: 'a', expires_in: 0, refresh_token: 'rotated' });
      }
      return new Response(null, { status: 204 });
    });
    const ask = async (secret = 'refresh') => {
      resetSpotify();
      // A new worker each time: a running one would just repeat its last answer for a few seconds
      await (await freshWorker()).fetch(new Request('https://api.test/now-playing'), { ...env, SPOTIFY_REFRESH_TOKEN: secret });
    };
    await ask();
    await ask();
    assert.match(bodies[0], /refresh_token=refresh$/);
    assert.match(bodies[1], /refresh_token=rotated$/);
    // Signing in again replaces the secret, which wins over the rotated one
    await ask('fresh');
    assert.match(bodies[2], /refresh_token=fresh$/);
  });
});

describe('the other routes', () => {
  it('serves the stored counts, and says when there are none yet', async () => {
    const env = createEnv();
    assert.equal((await get(env, '/most-played')).status, 503);
    await env.DB.prepare("INSERT INTO listens VALUES (? , 'Song', 'Band', 'Record', 'Band', '[\"Band\"]', NULL)").bind(Math.floor(Date.now() / 1000) - 60).run();
    const { refreshStats } = await import('../src/stats.ts');
    await refreshStats(env, true);
    const w = await freshWorker();
    const response = await w.fetch(new Request('https://api.test/most-played'), env);
    const body = (await response.json()) as { user: string; ranges: { week: { listens: number } } };
    assert.equal(body.user, 'tester');
    assert.equal(body.ranges.week.listens, 1);
  });

  it('pages through the history, newest first', async () => {
    const env = createEnv();
    for (const t of [10, 20, 30]) {
      await env.DB.prepare("INSERT INTO listens VALUES (?, 'S', 'B', '', 'B', '[\"B\"]', NULL)").bind(t).run();
    }
    const w = await freshWorker();
    const first = (await (await w.fetch(new Request('https://api.test/history?limit=2'), env)).json()) as {
      listens: { listenedAt: number }[];
      next: number | null;
    };
    assert.deepEqual(first.listens.map((l) => l.listenedAt), [30, 20]);
    assert.equal(first.next, 20);
    const second = (await (await w.fetch(new Request('https://api.test/history?limit=2&before=20'), env)).json()) as typeof first;
    assert.deepEqual(second.listens.map((l) => l.listenedAt), [10]);
    assert.equal(second.next, null);
  });

  it('lets only my site read it from a browser', async () => {
    const env = createEnv();
    const ok = await get(env, '/status', { Origin: 'https://example.test' });
    assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://example.test');
    const local = await get(env, '/status', { Origin: 'http://localhost:4321' });
    assert.equal(local.headers.get('Access-Control-Allow-Origin'), 'http://localhost:4321');
    const other = await get(env, '/status', { Origin: 'https://evil.test' });
    assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
    const preflight = await worker.fetch(new Request('https://api.test/status', { method: 'OPTIONS', headers: { Origin: 'https://example.test' } }), env);
    assert.equal(preflight.status, 204);
  });

  it('only syncs by hand for someone with the admin token', async () => {
    const post = (env: Env, auth?: string) =>
      worker.fetch(new Request('https://api.test/admin/sync', { method: 'POST', headers: auth ? { Authorization: auth } : {} }), env);
    assert.equal((await post(createEnv())).status, 404);
    assert.equal((await post(createEnv({ ADMIN_TOKEN: 's3cret' }))).status, 401);
    assert.equal((await post(createEnv({ ADMIN_TOKEN: 's3cret' }), 'Bearer wrong')).status, 401);
    fakeNetwork(() => Response.json({ payload: { listens: [] } }));
    const response = await post(createEnv({ ADMIN_TOKEN: 's3cret' }), 'Bearer s3cret');
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { error: unknown }).error, null);
  });

  it('records a ListenBrainz outage in /status, which a sync updates at once', async () => {
    const env = createEnv({ ADMIN_TOKEN: 't' });
    fakeNetwork(() => new Response('down', { status: 503 }));
    const w = await freshWorker();
    const statusNow = async () =>
      (await (await w.fetch(new Request('https://api.test/status'), env)).json()) as {
        listenbrainz: { lastError: string | null; lastSuccess: number | null };
      };
    assert.equal((await statusNow()).listenbrainz.lastError, null);
    const synced = await w.fetch(new Request('https://api.test/admin/sync', { method: 'POST', headers: { Authorization: 'Bearer t' } }), env);
    assert.match(((await synced.json()) as { error: string }).error, /HTTP 503/);
    const status = await statusNow();
    assert.match(status.listenbrainz.lastError!, /HTTP 503/);
    assert.equal(status.listenbrainz.lastSuccess, null);
  });

  it('returns 404 for anything else', async () => {
    assert.equal((await get(createEnv(), '/nope')).status, 404);
  });
});

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { coverUrl, syncListens, toRow, type LBListen } from '../src/listenbrainz.ts';
import { createEnv } from './d1.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const listen = (listened_at: number, track = `Song ${listened_at}`, artist = 'Band'): LBListen => ({
  listened_at,
  track_metadata: { track_name: track, artist_name: artist, release_name: 'Record' },
});

/** A fake ListenBrainz that answers min_ts and count like the real one: the oldest listens after min_ts */
function fakeListenBrainz(all: LBListen[], options: { failAfter?: number } = {}) {
  const requests: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    if (options.failAfter !== undefined && requests.length > options.failAfter) return new Response('down', { status: 503 });
    const min = Number(url.searchParams.get('min_ts'));
    const count = Number(url.searchParams.get('count'));
    const listens = all.filter((l) => l.listened_at! > min).sort((a, b) => a.listened_at! - b.listened_at!).slice(0, count);
    return Response.json({ payload: { listens } });
  }) as typeof fetch;
  return requests;
}

const stored = async (env: ReturnType<typeof createEnv>) =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM listens').first<{ n: number }>())!.n;

describe('toRow', () => {
  it('stores every credited artist once, whatever the case', () => {
    const row = toRow({
      listened_at: 5,
      track_metadata: {
        track_name: 'Duet',
        artist_name: 'A & B',
        additional_info: { artist_names: ['A', 'B', 'a'] },
      },
    })!;
    assert.deepEqual(JSON.parse(row.artists), ['A', 'B']);
  });

  it('falls back to the credited name, and to mapped artists before it', () => {
    assert.deepEqual(JSON.parse(toRow(listen(1))!.artists), ['Band']);
    const mapped = toRow({
      listened_at: 2,
      track_metadata: { artist_name: 'X', mbid_mapping: { artists: [{ artist_credit_name: 'Y' }] } },
    })!;
    assert.deepEqual(JSON.parse(mapped.artists), ['Y']);
  });

  it('skips what is playing now, which has no time', () => {
    assert.equal(toRow({ track_metadata: { track_name: 'Live' } }), null);
  });

  it('uses the artist as album artist unless the release has its own', () => {
    assert.equal(toRow(listen(1))!.album_artist, 'Band');
    const row = toRow({ listened_at: 1, track_metadata: { artist_name: 'Band', additional_info: { release_artist_name: 'Various' } } })!;
    assert.equal(row.album_artist, 'Various');
  });
});

describe('coverUrl', () => {
  it('prefers the Cover Art Archive thumbnail, then the release', () => {
    assert.match(coverUrl({ mbid_mapping: { caa_release_mbid: 'r', caa_id: 7 } })!, /mbid-r-7_thumb250\.jpg$/);
    assert.equal(coverUrl({ mbid_mapping: { release_mbid: 'abc' } }), 'https://coverartarchive.org/release/abc/front-250');
    assert.equal(coverUrl({}), null);
  });
});

describe('syncListens', () => {
  const now = Date.UTC(2026, 9, 5) / 1000;

  it('starts at the beginning of the earliest range and pages forward', async () => {
    const env = createEnv({ SYNC_PAGE_SIZE: '2', SYNC_MAX_PAGES: '10' });
    const jan1 = Date.UTC(2026, 0, 1) / 1000;
    const times = [jan1 - 100, jan1 + 10, jan1 + 20, jan1 + 30, jan1 + 40];
    const requests = fakeListenBrainz(times.map((t) => listen(t)));
    const result = await syncListens(env, now);
    // The listen before the year is never asked for
    assert.equal(result.added, 4);
    assert.equal(await stored(env), 4);
    assert.equal(requests[0].searchParams.get('min_ts'), String(jan1));
    assert.ok(requests.length >= 2);
  });

  it('only adds what is new on the next run', async () => {
    const env = createEnv({ SYNC_PAGE_SIZE: '3' });
    const base = now - 1000;
    const all = [1, 2, 3, 4, 5].map((i) => listen(base + i));
    fakeListenBrainz(all);
    assert.equal((await syncListens(env, now)).added, 5);
    all.push(listen(base + 6), listen(base + 7));
    fakeListenBrainz(all);
    assert.equal((await syncListens(env, now)).added, 2);
    fakeListenBrainz(all);
    assert.equal((await syncListens(env, now)).added, 0);
    assert.equal(await stored(env), 7);
  });

  it('keeps two listens from the same second even when a page ends between them', async () => {
    const env = createEnv({ SYNC_PAGE_SIZE: '2' });
    const t = now - 500;
    fakeListenBrainz([listen(t, 'One'), listen(t + 1, 'Two'), listen(t + 1, 'Three'), listen(t + 2, 'Four')]);
    await syncListens(env, now);
    assert.equal(await stored(env), 4);
  });

  it('does a limited number of pages per run, and carries on next time', async () => {
    // Each page after the first starts one second early, so it brings one fewer new listen
    const env = createEnv({ SYNC_PAGE_SIZE: '3', SYNC_MAX_PAGES: '2' });
    const base = now - 1000;
    const all = Array.from({ length: 9 }, (_, i) => listen(base + i + 1));
    const requests = fakeListenBrainz(all);
    await syncListens(env, now);
    assert.equal(requests.length, 2);
    assert.equal(await stored(env), 5);
    fakeListenBrainz(all);
    await syncListens(env, now);
    assert.equal(await stored(env), 9);
  });

  it('does not stall on a page that is all one second', async () => {
    const env = createEnv({ SYNC_PAGE_SIZE: '2', SYNC_MAX_PAGES: '10' });
    const t = now - 500;
    fakeListenBrainz([listen(t, 'One'), listen(t, 'Two'), listen(t, 'Three'), listen(t + 5, 'Four')]);
    const first = await syncListens(env, now);
    assert.ok(first.added >= 3);
    fakeListenBrainz([listen(t, 'One'), listen(t, 'Two'), listen(t, 'Three'), listen(t + 5, 'Four'), listen(t + 9, 'Five')]);
    await syncListens(env, now);
    // The run after still reaches the listens that came later
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM listens WHERE track IN ('Four', 'Five')").first<{ n: number }>())!.n, 2);
  });

  it('keeps the pages that arrived when ListenBrainz goes down partway, and says so', async () => {
    const env = createEnv({ SYNC_PAGE_SIZE: '2', SYNC_MAX_PAGES: '10' });
    const all = [1, 2, 3, 4, 5, 6].map((i) => listen(now - 1000 + i));
    fakeListenBrainz(all, { failAfter: 1 });
    const result = await syncListens(env, now);
    assert.match(result.error!, /HTTP 503/);
    assert.equal(result.added, 2);
    assert.equal(await stored(env), 2);
  });

  it('reports an outage from the very first page without throwing', async () => {
    const env = createEnv();
    fakeListenBrainz([], { failAfter: 0 });
    const result = await syncListens(env, now);
    assert.deepEqual([result.added, await stored(env)], [0, 0]);
    assert.match(result.error!, /HTTP 503/);
  });

  it('tries a page again after a timeout or a server error, but not after a client error', async () => {
    const env = createEnv();
    const all = [listen(now - 100)];
    const answers = [new Response('bad gateway', { status: 502 }), Response.json({ payload: { listens: all } })];
    let calls = 0;
    globalThis.fetch = (async () => answers[calls++]) as typeof fetch;
    assert.equal((await syncListens(env, now)).added, 1);
    assert.equal(calls, 2);

    calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return Response.json({ payload: { listens: [listen(now - 50)] } });
    }) as typeof fetch;
    assert.equal((await syncListens(env, now)).added, 1);
    assert.equal(calls, 2);

    calls = 0;
    globalThis.fetch = (async () => (calls++, new Response('no such user', { status: 404 }))) as typeof fetch;
    assert.match((await syncListens(env, now)).error!, /HTTP 404/);
    assert.equal(calls, 1);
  });

  it('gives up for the run once its time is up, and carries on next time', async () => {
    const env = createEnv({ SYNC_PAGE_SIZE: '2', SYNC_MAX_PAGES: '10', SYNC_BUDGET_MS: '1' });
    const all = Array.from({ length: 8 }, (_, i) => listen(now - 1000 + i + 1));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const url = new URL(String(input));
      const min = Number(url.searchParams.get('min_ts'));
      return Response.json({ payload: { listens: all.filter((l) => l.listened_at! > min).slice(0, 2) } });
    }) as typeof fetch;
    const first = await syncListens(env, now);
    assert.equal(first.pages, 1);
    assert.equal(first.error, null);
    assert.equal(await stored(env), 2);
  });
});

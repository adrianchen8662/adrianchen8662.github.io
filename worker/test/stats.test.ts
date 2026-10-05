import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readStats, refreshStats } from '../src/stats.ts';
import { toRow, type LBListen } from '../src/listenbrainz.ts';
import { createEnv } from './d1.ts';

const NOW = Date.UTC(2026, 9, 5, 12) / 1000;
const DAY = 86400;

async function seed(env: ReturnType<typeof createEnv>, listens: LBListen[]) {
  for (const l of listens) {
    const row = toRow(l)!;
    await env.DB
      .prepare('INSERT INTO listens (listened_at, track, artist, album, album_artist, artists, cover) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(row.listened_at, row.track, row.artist, row.album, row.album_artist, row.artists, row.cover)
      .run();
  }
}

const play = (daysAgo: number, track: string, artist: string, album = '', extra: object = {}): LBListen => ({
  listened_at: NOW - daysAgo * DAY,
  track_metadata: { track_name: track, artist_name: artist, release_name: album, ...extra },
});

describe('refreshStats', () => {
  it('counts each range from the listens in it', async () => {
    const env = createEnv();
    await seed(env, [
      play(1, 'A', 'One', 'Album'),
      play(2, 'A', 'One', 'Album'),
      play(3, 'B', 'Two', 'Album 2'),
      play(20, 'C', 'Three', 'Album 3'),
      play(100, 'D', 'Four', 'Album 4'),
      play(400, 'E', 'Five', 'Album 5'),
    ]);
    assert.equal(await refreshStats(env, true, NOW), true);
    const { ranges } = (await readStats(env))!;
    assert.deepEqual([ranges.week.listens, ranges.month.listens, ranges.year.listens], [3, 4, 5]);
    assert.equal(ranges.week.artistCount, 2);
    assert.deepEqual(ranges.week.artists.map((a) => [a.name, a.plays]), [['One', 2], ['Two', 1]]);
    assert.deepEqual(ranges.week.tracks[0], { name: 'A', by: 'One', cover: null, plays: 2 });
    assert.deepEqual(ranges.week.albums[0], { name: 'Album', by: 'One', cover: null, plays: 2 });
  });

  it('counts a track, album or artist once however it is capitalised, and keeps the newest spelling', async () => {
    const env = createEnv();
    await seed(env, [play(3, 'hello', 'adele', 'twenty five'), play(1, 'Hello', 'Adele', 'Twenty Five')]);
    await refreshStats(env, true, NOW);
    const week = (await readStats(env))!.ranges.week;
    assert.equal(week.tracks.length, 1);
    assert.equal(week.tracks[0].plays, 2);
    assert.equal(week.tracks[0].name, 'Hello');
    assert.equal(week.artists[0].name, 'Adele');
    assert.equal(week.albums[0].name, 'Twenty Five');
  });

  it('gives every credited artist the play', async () => {
    const env = createEnv();
    await seed(env, [
      play(1, 'Duet', 'A & B', '', { additional_info: { artist_names: ['A', 'B'] } }),
      play(2, 'Solo', 'A'),
    ]);
    await refreshStats(env, true, NOW);
    const week = (await readStats(env))!.ranges.week;
    assert.equal(week.artistCount, 2);
    assert.deepEqual(week.artists.map((a) => [a.name, a.plays]), [['A', 2], ['B', 1]]);
    // The track is credited to the artist as ListenBrainz wrote it
    assert.equal(week.tracks.find((t) => t.name === 'Duet')!.by, 'A & B');
  });

  it('breaks ties in favour of the more recent play, and keeps only the top five', async () => {
    const env = createEnv();
    await seed(env, ['a', 'b', 'c', 'd', 'e', 'f'].map((name, i) => play(i + 1, `T-${name}`, `Artist ${name}`)));
    await refreshStats(env, true, NOW);
    const week = (await readStats(env))!.ranges.week;
    assert.deepEqual(week.artists.map((a) => a.name), ['Artist a', 'Artist b', 'Artist c', 'Artist d', 'Artist e']);
  });

  it('uses the newest cover that exists, not just the newest listen', async () => {
    const env = createEnv();
    await seed(env, [
      play(3, 'Song', 'Band', 'Record', { mbid_mapping: { release_mbid: 'old' } }),
      play(1, 'Song', 'Band', 'Record'),
    ]);
    await refreshStats(env, true, NOW);
    const week = (await readStats(env))!.ranges.week;
    assert.equal(week.tracks[0].cover, 'https://coverartarchive.org/release/old/front-250');
    assert.equal(week.albums[0].cover, 'https://coverartarchive.org/release/old/front-250');
  });

  it('leaves tracks and albums with no name out of their lists, but counts the listen', async () => {
    const env = createEnv();
    await seed(env, [{ listened_at: NOW - DAY, track_metadata: { artist_name: 'Band' } }]);
    await refreshStats(env, true, NOW);
    const week = (await readStats(env))!.ranges.week;
    assert.equal(week.listens, 1);
    assert.deepEqual([week.tracks, week.albums], [[], []]);
    assert.equal(week.artists[0].name, 'Band');
  });

  it('does not count again until something is new or an hour has passed', async () => {
    const env = createEnv();
    await seed(env, [play(1, 'A', 'One')]);
    assert.equal(await refreshStats(env, false, NOW), true); // nothing stored yet
    assert.equal(await refreshStats(env, false, NOW + 60), false);
    assert.equal(await refreshStats(env, true, NOW + 60), true);
    assert.equal(await refreshStats(env, false, NOW + 3 * 3600), true);
  });

  it('has nothing to read before the first count', async () => {
    assert.equal(await readStats(createEnv()), null);
  });
});

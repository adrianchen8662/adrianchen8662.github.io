// /listenbrainz.json: what I've played most, counted when the site is built, so the About page can show
// it without every visitor fetching thousands of listens from ListenBrainz.
//
// Only builds run with LISTENBRAINZ_SNAPSHOT=true fetch it (the deploy workflow does, every 6 hours).
// Other builds publish an empty file, and the page then counts the listens in the browser instead.
import type { APIRoute } from 'astro';
import { fetchListens, playedAt, SNAPSHOT_PATH, type Listen, type Snapshot } from '../lib/listenbrainz';
import { RANGES, tally } from '../lib/most-played';
import { LISTENBRAINZ_USER } from '../site';

const ATTEMPTS = 3;

/** Just what the Now Playing card shows */
function trim(listen?: Listen): Listen | undefined {
  if (!listen) return undefined;
  const meta = listen.track_metadata ?? {};
  const mapping = meta.mbid_mapping ?? {};
  return {
    listened_at: listen.listened_at,
    track_metadata: {
      track_name: meta.track_name,
      artist_name: meta.artist_name,
      release_name: meta.release_name,
      mbid_mapping: { caa_release_mbid: mapping.caa_release_mbid, caa_id: mapping.caa_id, release_mbid: mapping.release_mbid },
      additional_info: { release_mbid: meta.additional_info?.release_mbid },
    },
  };
}

async function fresh(): Promise<Snapshot> {
  const now = Date.now() / 1000;
  // Far enough back for every range; in January, the last 30 days reach into last year
  const since = Math.min(...RANGES.map((range) => range.start(now)));
  const listens = await fetchListens(LISTENBRAINZ_USER, since);
  const ranges = Object.fromEntries(
    RANGES.map((range) => [range.id, tally(listens.filter((listen) => playedAt(listen) > range.start(now)))]),
  ) as Snapshot['ranges'];
  return { user: LISTENBRAINZ_USER, fetchedAt: Math.floor(now), latest: trim(listens[0]), ranges };
}

/** The snapshot the live site has now, kept when ListenBrainz is down, so a deploy doesn't throw it away */
async function published(site: URL | undefined): Promise<Snapshot | null> {
  if (!site) return null;
  try {
    const response = await fetch(new URL(SNAPSHOT_PATH, site), { signal: AbortSignal.timeout(30000) });
    const data = response.ok ? await response.json() : null;
    return data?.ranges && data.user === LISTENBRAINZ_USER ? data : null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ site }) => {
  let snapshot: Snapshot | null = null;
  if (process.env.LISTENBRAINZ_SNAPSHOT === 'true') {
    for (let attempt = 1; attempt <= ATTEMPTS && !snapshot; attempt++) {
      try {
        snapshot = await fresh();
      } catch (error) {
        console.warn(`ListenBrainz snapshot, attempt ${attempt} of ${ATTEMPTS} failed: ${error}`);
        if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 30000));
      }
    }
    if (!snapshot) {
      snapshot = await published(site);
      console.warn(snapshot ? 'Keeping the snapshot already on the site' : 'Publishing no ListenBrainz snapshot');
    }
  }
  return new Response(JSON.stringify(snapshot ?? {}), { headers: { 'Content-Type': 'application/json' } });
};

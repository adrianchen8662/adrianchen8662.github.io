// /listenbrainz.json: what I've played most, counted when the site is built, so the About page can show
// it without every visitor fetching thousands of listens from ListenBrainz.
//
// Only builds run with LISTENBRAINZ_SNAPSHOT=true fetch it (the deploy workflow does, every hour).
// Other builds publish an empty file, and the page then counts the listens in the browser instead.
import { appendFileSync } from 'node:fs';
import type { APIRoute } from 'astro';
import { fetchListens, playedAt, SNAPSHOT_PATH, type Snapshot } from '../lib/listenbrainz';
import { RANGES, tally } from '../lib/most-played';
import { LISTENBRAINZ_USER } from '../site';

const ATTEMPTS = 3;

/** Says what happened on the workflow run's page (an annotation and a summary), so a stale snapshot has an explanation */
function report(level: 'notice' | 'warning', message: string) {
  console.log(message);
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  // Workflow commands only count at the start of a line, and Astro's progress output leaves the cursor mid-line
  process.stdout.write(`\n::${level} title=ListenBrainz snapshot::${message}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**ListenBrainz snapshot:** ${message}\n\n`);
}

const when = (seconds: number) => new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

async function fresh(): Promise<Snapshot> {
  const now = Date.now() / 1000;
  // Far enough back for every range; in January, the last 30 days reach into last year
  const since = Math.min(...RANGES.map((range) => range.start(now)));
  const listens = await fetchListens(LISTENBRAINZ_USER, since);
  const ranges = Object.fromEntries(
    RANGES.map((range) => [range.id, tally(listens.filter((listen) => playedAt(listen) > range.start(now)))]),
  ) as Snapshot['ranges'];
  return { user: LISTENBRAINZ_USER, fetchedAt: Math.floor(now), ranges };
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
        report('notice', `Counted ${snapshot.ranges.year.listens.toLocaleString('en-US')} listens from this year, as of ${when(snapshot.fetchedAt)}.`);
      } catch (error) {
        console.warn(`ListenBrainz snapshot, attempt ${attempt} of ${ATTEMPTS} failed: ${error}`);
        if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 30000));
      }
    }
    if (!snapshot) {
      snapshot = await published(site);
      report(
        'warning',
        snapshot
          ? `ListenBrainz didn't answer after ${ATTEMPTS} tries, so the page keeps the counts from ${when(snapshot.fetchedAt)}.`
          : `ListenBrainz didn't answer after ${ATTEMPTS} tries and the site has no earlier counts, so the page will count in the browser.`,
      );
    }
  } else {
    console.log('Not fetching the ListenBrainz snapshot (LISTENBRAINZ_SNAPSHOT is not true); publishing an empty one.');
  }
  return new Response(JSON.stringify(snapshot ?? {}), { headers: { 'Content-Type': 'application/json' } });
};

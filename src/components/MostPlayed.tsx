// The artists, albums and tracks played most on ListenBrainz over the last 7 or 30 days, or this year.
// ListenBrainz's own stats can lag weeks behind imported listens, so these are counted from the listens.
// The site is built with a snapshot of the counts (see src/pages/listenbrainz.json.ts); without one,
// the listens are fetched and counted here in the browser.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ago, fetchListens, loadSnapshot, playedAt, type Listen, type Snapshot } from '../lib/listenbrainz';
import { RANGES, tally, type Range } from '../lib/most-played';
import './MostPlayed.css';

const SKELETON_ROWS = 5;

type Status = { kind: 'loading'; loaded: number } | { kind: 'error' };

/** Listens loaded so far: every one after `since`, newest first */
interface History {
  since: number;
  listens: Listen[];
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

function Cover({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="mp-cover mp-cover-fallback" aria-hidden="true">&#9834;</span>;
  return <img className="mp-cover" src={src} alt="" width={48} height={48} loading="lazy" onError={() => setFailed(true)} />;
}

function Column({ title, kind, children }: { title: string; kind: string; children: ReactNode }) {
  return (
    <section className={`mp-column mp-${kind}`}>
      <h3 className="mp-heading">{title}</h3>
      <ol className="mp-list">{children}</ol>
    </section>
  );
}

function Plays({ n }: { n: number }) {
  return <span className="mp-plays">{plural(n, 'play')}</span>;
}

function Skeleton() {
  return (
    <div className="mp-grid" aria-busy="true">
      {['Artists', 'Albums', 'Tracks'].map((title) => (
        <Column key={title} title={title} kind="loading">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <li key={i} className="mp-item">
              <span className="mp-skeleton mp-cover" />
              <span className="mp-text">
                <span className="mp-skeleton mp-line" style={{ width: `${80 - i * 8}%` }} />
                <span className="mp-skeleton mp-line" style={{ width: '45%' }} />
              </span>
            </li>
          ))}
        </Column>
      ))}
    </div>
  );
}

export default function MostPlayed({ username }: { username: string }) {
  const [range, setRange] = useState<Range>(RANGES[1]);
  const [now] = useState(() => Date.now() / 1000);
  // The counts the site was built with: undefined while loading, null when there are none
  const [snapshot, setSnapshot] = useState<Snapshot | null>();
  // Without a snapshot, the listens fetched so far. They're kept between switches, so a shorter range
  // shows at once and a longer one loads only the older listens.
  const [history, setHistory] = useState<History>();
  const [status, setStatus] = useState<Status>({ kind: 'loading', loaded: 0 });

  useEffect(() => {
    let cancelled = false;
    loadSnapshot(username).then((loaded) => {
      if (!cancelled) setSnapshot(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const live = snapshot === null;
  const since = range.start(now);
  const covered = history !== undefined && history.since <= since;
  const counted = useMemo(
    () => (covered ? tally(history.listens.filter((listen) => playedAt(listen) > since)) : undefined),
    [covered, history, since],
  );
  const tallies = snapshot ? snapshot.ranges[range.id] : counted;

  useEffect(() => {
    if (!live || covered) return;
    let cancelled = false;
    const have = history?.listens ?? [];
    setStatus({ kind: 'loading', loaded: have.length });
    fetchListens(username, since, history?.since, (count) => {
      if (!cancelled) setStatus({ kind: 'loading', loaded: have.length + count });
    })
      .then((older) => {
        if (!cancelled) setHistory({ since, listens: [...have, ...older] });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [live, username, since, covered, history]);

  let summary: string = range.summary;
  if (tallies) summary += ` · ${plural(tallies.listens, 'listen')} · ${plural(tallies.artistCount, 'artist')}`;
  else if (status.kind === 'loading' && status.loaded > 0) summary += ` · loading, ${plural(status.loaded, 'listen')} so far`;
  if (snapshot) summary += ` · updated ${ago(snapshot.fetchedAt)}`;

  let body: ReactNode;
  if (tallies === undefined && status.kind === 'error') {
    body = (
      <p className="mp-message">
        Couldn't reach ListenBrainz just now. See{' '}
        <a href={`https://listenbrainz.org/user/${username}/`} target="_blank" rel="noopener noreferrer">
          my listening history
        </a>{' '}
        there instead.
      </p>
    );
  } else if (!tallies) {
    body = <Skeleton />;
  } else if (tallies.listens === 0) {
    body = <p className="mp-message">Nothing played {range.when}.</p>;
  } else {
    body = (
      <div className="mp-grid">
        <Column title="Artists" kind="artists">
          {tallies.artists.map((artist) => (
            <li key={artist.name} className="mp-item">
              <span className="mp-text">
                <span className="mp-row">
                  <span className="mp-name">{artist.name}</span>
                  <Plays n={artist.plays} />
                </span>
                <span className="mp-bar" aria-hidden="true">
                  <span style={{ width: `${(artist.plays / tallies.artists[0].plays) * 100}%` }} />
                </span>
              </span>
            </li>
          ))}
        </Column>
        {(['albums', 'tracks'] as const).map((kind) => (
          <Column key={kind} title={kind === 'albums' ? 'Albums' : 'Tracks'} kind={kind}>
            {tallies[kind].map((entry) => (
              <li key={`${entry.name}\n${entry.by}`} className="mp-item">
                <Cover src={entry.cover} />
                <span className="mp-text">
                  <span className="mp-name">{entry.name}</span>
                  <span className="mp-by">{entry.by}</span>
                </span>
                <Plays n={entry.plays} />
              </li>
            ))}
          </Column>
        ))}
      </div>
    );
  }

  return (
    <div className="most-played">
      <div className="mp-toolbar">
        <p className="mp-summary" aria-live="polite">{summary}</p>
        <div className="mp-ranges" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={r === range} onClick={() => setRange(r)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {body}
    </div>
  );
}

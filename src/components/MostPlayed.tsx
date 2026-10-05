// The artists, albums and tracks played most on ListenBrainz over the last 7 or 30 days, or this year.
// The Worker (worker/) counts them from the listens it keeps, since ListenBrainz's own stats can lag weeks
// behind imported listens, and refreshes the counts every 15 minutes.
import { useEffect, useState, type ReactNode } from 'react';
import { ago, getMostPlayed, type Snapshot } from '../lib/api';
import { RANGES, type Range } from '../lib/most-played';
import './MostPlayed.css';

const SKELETON_ROWS = 5;

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
  // The counts: undefined while loading, null when they couldn't be loaded
  const [stats, setStats] = useState<Snapshot | null>();

  useEffect(() => {
    let cancelled = false;
    getMostPlayed()
      .then((loaded) => {
        if (!cancelled) setStats(loaded);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tallies = stats?.ranges[range.id];

  let summary: string = range.summary;
  if (tallies) summary += ` · ${plural(tallies.listens, 'listen')} · ${plural(tallies.artistCount, 'artist')}`;
  if (stats) summary += ` · updated ${ago(stats.fetchedAt)}`;

  let body: ReactNode;
  if (stats === null) {
    body = (
      <p className="mp-message">
        Couldn't load my listening stats just now. See{' '}
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

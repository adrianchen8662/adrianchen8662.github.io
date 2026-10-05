// The artists, albums and tracks played most on ListenBrainz over the last 7 or 30 days, or this year.
// ListenBrainz's own stats can lag weeks behind imported listens, so this counts the listens themselves.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { API, coverUrl, fetchJSON, type Listen } from '../lib/listenbrainz';
import './MostPlayed.css';

const DAY = 24 * 60 * 60;
const PAGE_SIZE = 1000; // the most listens ListenBrainz returns at once
const MAX_PAGES = 25;
const TOP = 5;

const RANGES = [
  { id: 'week', label: '7 days', summary: 'Last 7 days', when: 'in the last 7 days', start: (now: number) => now - 7 * DAY },
  { id: 'month', label: '30 days', summary: 'Last 30 days', when: 'in the last 30 days', start: (now: number) => now - 30 * DAY },
  {
    id: 'year',
    label: 'This year',
    summary: 'This year',
    when: 'this year',
    start: (now: number) => new Date(new Date(now * 1000).getFullYear(), 0, 1).getTime() / 1000,
  },
] as const;

type Range = (typeof RANGES)[number];

interface Entry {
  name: string;
  /** The artist, for albums and tracks */
  by?: string;
  cover?: string | null;
  plays: number;
}

interface Tallies {
  listens: number;
  artistCount: number;
  artists: Entry[];
  albums: Entry[];
  tracks: Entry[];
}

type Status = { kind: 'loading'; loaded: number } | { kind: 'error' };

/** Listens loaded so far: every one after `since`, newest first */
interface History {
  since: number;
  listens: Listen[];
}

const playedAt = (listen: Listen) => listen.listened_at ?? 0;

/**
 * Every listen after `after`, and up to `before` if given, newest first.
 * ListenBrainz answers min_ts with the oldest listens after it, so this pages forward from there.
 */
async function fetchListens(username: string, after: number, before: number | undefined, onProgress: (count: number) => void) {
  const all: Listen[] = [];
  let since = after;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ min_ts: String(since), count: String(PAGE_SIZE) });
    if (before !== undefined) params.set('max_ts', String(before + 1));
    const data = await fetchJSON(`${API}/user/${encodeURIComponent(username)}/listens?${params}`);
    const listens: Listen[] = data.payload?.listens ?? [];
    all.push(...listens);
    onProgress(all.length);
    if (listens.length < PAGE_SIZE) break;
    since = Math.max(...listens.map(playedAt));
  }
  // Newest first, so ties in the counts go to whatever was played more recently
  return all.sort((a, b) => playedAt(b) - playedAt(a));
}

/** Play counts keyed by name, ignoring case; an entry keeps the spelling and cover of its most recent listen */
class Counter {
  private entries = new Map<string, Entry>();

  add(key: string, entry: Omit<Entry, 'plays'>) {
    const k = key.toLowerCase();
    const existing = this.entries.get(k);
    if (existing) {
      existing.plays++;
      existing.cover ??= entry.cover;
    } else {
      this.entries.set(k, { ...entry, plays: 1 });
    }
  }

  get size() {
    return this.entries.size;
  }

  top(n: number) {
    return [...this.entries.values()].sort((a, b) => b.plays - a.plays).slice(0, n);
  }
}

function tally(listens: Listen[]): Tallies {
  const artists = new Counter();
  const albums = new Counter();
  const tracks = new Counter();
  for (const { track_metadata: meta = {} } of listens) {
    const artist = meta.artist_name ?? 'Unknown artist';
    // Every artist credited on a track gets the play, as in ListenBrainz's stats
    const credited = [meta.additional_info?.artist_names, meta.mbid_mapping?.artists?.map((a) => a.artist_credit_name)]
      .find((names) => names?.length) ?? [artist];
    for (const name of credited) artists.add(name, { name });

    const cover = coverUrl(meta);
    if (meta.release_name) {
      const albumArtist = meta.additional_info?.release_artist_name ?? artist;
      albums.add(`${meta.release_name}\n${albumArtist}`, { name: meta.release_name, by: albumArtist, cover });
    }
    if (meta.track_name) {
      tracks.add(`${meta.track_name}\n${artist}`, { name: meta.track_name, by: artist, cover });
    }
  }
  return {
    listens: listens.length,
    artistCount: artists.size,
    artists: artists.top(TOP),
    albums: albums.top(TOP),
    tracks: tracks.top(TOP),
  };
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
          {Array.from({ length: TOP }, (_, i) => (
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
  // Kept between switches, so a shorter range shows at once and a longer one loads only the older listens
  const [history, setHistory] = useState<History>();
  const [status, setStatus] = useState<Status>({ kind: 'loading', loaded: 0 });

  const since = range.start(now);
  const covered = history !== undefined && history.since <= since;
  const tallies = useMemo(
    () => (covered ? tally(history.listens.filter((listen) => playedAt(listen) > since)) : undefined),
    [covered, history, since],
  );

  useEffect(() => {
    if (covered) return;
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
  }, [username, since, covered, history]);

  let summary: string = range.summary;
  if (tallies) summary += ` · ${plural(tallies.listens, 'listen')} · ${plural(tallies.artistCount, 'artist')}`;
  else if (status.kind === 'loading' && status.loaded > 0) summary += ` · loading, ${plural(status.loaded, 'listen')} so far`;

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

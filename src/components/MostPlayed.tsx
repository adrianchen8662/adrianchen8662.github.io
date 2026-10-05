// The artists, albums and tracks played most on ListenBrainz over the last 30 days.
// ListenBrainz's own monthly stats can lag weeks behind imported listens, so this counts the listens themselves.
import { useEffect, useState, type ReactNode } from 'react';
import { API, coverUrl, fetchJSON, type Listen } from '../lib/listenbrainz';
import './MostPlayed.css';

const DAYS = 30;
const PAGE_SIZE = 1000; // the most listens ListenBrainz returns at once
const MAX_PAGES = 5;
const TOP = 5;

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

type State = { kind: 'loading' } | { kind: 'done'; tallies: Tallies } | { kind: 'error' };

/** Every listen after minTs. ListenBrainz answers min_ts with the oldest listens after it, so page forward from there. */
async function listensSince(username: string, minTs: number) {
  const all: Listen[] = [];
  let since = minTs;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchJSON(`${API}/user/${encodeURIComponent(username)}/listens?min_ts=${since}&count=${PAGE_SIZE}`);
    const listens: Listen[] = data.payload?.listens ?? [];
    all.push(...listens);
    if (listens.length < PAGE_SIZE) break;
    since = Math.max(...listens.map((listen) => listen.listened_at ?? 0));
  }
  // Newest first, so ties in the counts go to whatever was played more recently
  return all.sort((a, b) => (b.listened_at ?? 0) - (a.listened_at ?? 0));
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
  const [state, setState] = useState<State>({ kind: 'loading' });
  const history = `https://listenbrainz.org/user/${username}/`;

  useEffect(() => {
    let cancelled = false;
    const since = Math.floor(Date.now() / 1000) - DAYS * 24 * 60 * 60;
    listensSince(username, since)
      .then((listens) => {
        if (!cancelled) setState({ kind: 'done', tallies: tally(listens) });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (state.kind === 'error') {
    return (
      <p className="mp-summary">
        Couldn't reach ListenBrainz just now. See{' '}
        <a href={history} target="_blank" rel="noopener noreferrer">my listening history</a> there instead.
      </p>
    );
  }

  const tallies = state.kind === 'done' ? state.tallies : undefined;
  if (tallies?.listens === 0) {
    return <p className="mp-summary">Nothing played in the last {DAYS} days.</p>;
  }

  return (
    <div className="most-played">
      <p className="mp-summary">
        Last {DAYS} days
        {tallies && ` · ${plural(tallies.listens, 'listen')} · ${plural(tallies.artistCount, 'artist')}`}
      </p>
      {tallies ? (
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
      ) : (
        <Skeleton />
      )}
    </div>
  );
}

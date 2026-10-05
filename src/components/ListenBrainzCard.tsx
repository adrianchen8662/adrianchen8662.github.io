/*
  Now Playing card for ListenBrainz.

  Ported to React from listenbrainz-now-playing.html in
  https://github.com/prcutler/listenbrainz-widget and restyled with this site's palette.

  MIT License

  Copyright (c) 2026 Paul Cutler

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/
import { useEffect, useState } from 'react';
import { ago, API, coverUrl, fetchJSON, type Listen, type TrackMetadata } from '../lib/listenbrainz';
import './ListenBrainzCard.css';

const REFRESH_MS = 20000;

type State =
  | { kind: 'loading' }
  | { kind: 'track'; listen: Listen; live: boolean }
  | { kind: 'empty' }
  | { kind: 'error' };

/** Looks the track up on MusicBrainz when ListenBrainz hasn't matched it to a release yet */
async function searchCover(artist: string, track: string, album: string) {
  let query = `recording:"${track}" AND artist:"${artist}"`;
  if (album) query += ` AND release:"${album}"`;
  const data = await fetchJSON(
    `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`,
  );
  for (const recording of data.recordings ?? []) {
    for (const release of recording.releases ?? []) {
      if (release.id) return `https://coverartarchive.org/release/${release.id}/front-250`;
    }
  }
  return null;
}

/** Album art for one track; the card gives each track its own Cover, so the lookup runs once per track */
function Cover({ meta }: { meta: TrackMetadata }) {
  const [src, setSrc] = useState(() => coverUrl(meta));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src || !meta.artist_name || !meta.track_name) return;
    let cancelled = false;
    searchCover(meta.artist_name, meta.track_name, meta.release_name ?? '')
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!src || failed) return <div className="lb-art lb-art-fallback">&#9834;</div>;
  return <img className="lb-art" alt="" src={src} onError={() => setFailed(true)} />;
}

function NowPlaying({ username }: { username: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const profile = `https://listenbrainz.org/user/${username}/`;

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    let inFlight = false;

    async function load() {
      try {
        const user = encodeURIComponent(username);
        // What's playing right now, or else the most recent listen
        const playing = await fetchJSON(`${API}/user/${user}/playing-now`);
        const live: Listen[] = playing.payload?.listens ?? [];
        if (live.length) {
          if (!cancelled) setState({ kind: 'track', listen: live[0], live: true });
          return;
        }
        const recent = await fetchJSON(`${API}/user/${user}/listens?count=1`);
        const listens: Listen[] = recent.payload?.listens ?? [];
        if (!cancelled) setState(listens.length ? { kind: 'track', listen: listens[0], live: false } : { kind: 'empty' });
      } catch {
        // Keep showing the last track through a brief outage
        if (!cancelled) setState((previous) => (previous.kind === 'track' ? previous : { kind: 'error' }));
      }
    }

    // Ask again only once ListenBrainz has answered, so a slow API never gets overlapping requests
    async function poll() {
      timer = undefined;
      inFlight = true;
      await load();
      inFlight = false;
      if (!cancelled && !document.hidden) timer = window.setTimeout(poll, REFRESH_MS);
    }
    // Pause while the tab is hidden
    function onVisibilityChange() {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = undefined;
      } else if (timer === undefined && !inFlight) {
        poll();
      }
    }

    poll();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [username]);

  if (state.kind === 'loading') {
    return (
      <div className="lb-card" aria-busy="true">
        <div className="lb-skeleton lb-art" />
        <div className="lb-meta">
          <div className="lb-skeleton lb-line" style={{ width: '40%' }} />
          <div className="lb-skeleton lb-line" style={{ width: '85%', height: 20 }} />
          <div className="lb-skeleton lb-line" style={{ width: '55%' }} />
        </div>
      </div>
    );
  }

  if (state.kind !== 'track') {
    return (
      <div className="lb-panel">
        <div className="lb-label">{state.kind === 'empty' ? 'Silence' : 'Now Playing'}</div>
        <h3>{state.kind === 'empty' ? 'Nothing playing yet' : "Couldn't reach ListenBrainz"}</h3>
        <p>
          {state.kind === 'empty' ? 'This updates automatically when a track is scrobbled. ' : "It'll keep retrying. "}
          Meanwhile, see{' '}
          <a href={profile} target="_blank" rel="noopener noreferrer">
            my listening history
          </a>
          .
        </p>
      </div>
    );
  }

  const meta = state.listen.track_metadata ?? {};
  const when = state.live ? '' : ago(state.listen.listened_at);
  const track = [meta.artist_name, meta.track_name, meta.release_name, coverUrl(meta)].join('|');

  return (
    <a className="lb-card-link" href={profile} target="_blank" rel="noopener noreferrer">
      <div className="lb-card">
        <Cover key={track} meta={meta} />
        <div className="lb-meta">
          {state.live ? (
            <div className="lb-eyebrow">
              <span className="lb-eq" aria-hidden="true">
                <span /><span /><span /><span /><span />
              </span>
              Now Playing
            </div>
          ) : (
            <div className="lb-eyebrow lb-past">
              <span className="lb-dot" aria-hidden="true" /> Last Played{when && ` · ${when}`}
            </div>
          )}
          <div className="lb-title">{meta.track_name ?? 'Unknown track'}</div>
          <div className="lb-artist">{meta.artist_name ?? 'Unknown artist'}</div>
          {meta.release_name && <div className="lb-album">{meta.release_name}</div>}
          <div className="lb-footer">
            <span>{username}</span>
            <span className="lb-brand">
              via <b>ListenBrainz</b>
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

export default function ListenBrainzCard({ username }: { username: string }) {
  return (
    <div className="listenbrainz">
      <NowPlaying username={username} />
    </div>
  );
}

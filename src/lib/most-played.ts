// Counting the artists, albums and tracks played most, for the About page. The same code runs in the
// browser and when the site is built, so the snapshot and a live count always agree.
import { coverUrl, type Listen } from './listenbrainz';

const DAY = 24 * 60 * 60;
const TOP = 5;

export const RANGES = [
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

export type Range = (typeof RANGES)[number];
export type RangeId = Range['id'];

export interface Entry {
  name: string;
  /** The artist, for albums and tracks */
  by?: string;
  cover?: string | null;
  plays: number;
}

export interface Tallies {
  listens: number;
  artistCount: number;
  artists: Entry[];
  albums: Entry[];
  tracks: Entry[];
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

/** The most played in `listens`, which should be newest first so ties go to the more recent */
export function tally(listens: Listen[]): Tallies {
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

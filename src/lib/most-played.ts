// The ranges and counts on the About page's Most Played. The Worker (worker/src/stats.ts) does the counting,
// for the same three range ids.

export const RANGES = [
  { id: 'week', label: '7 days', summary: 'Last 7 days', when: 'in the last 7 days' },
  { id: 'month', label: '30 days', summary: 'Last 30 days', when: 'in the last 30 days' },
  { id: 'year', label: 'This year', summary: 'This year', when: 'this year' },
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

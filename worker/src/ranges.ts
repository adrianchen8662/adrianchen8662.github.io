// The ranges on the About page's Most Played. The site lists the same ids (src/lib/most-played.ts).
const DAY = 24 * 60 * 60;

export const RANGES = [
  { id: 'week', start: (now: number) => now - 7 * DAY },
  { id: 'month', start: (now: number) => now - 30 * DAY },
  // The year starts in UTC; the few hours' difference from my own time zone isn't worth a setting
  { id: 'year', start: (now: number) => Date.UTC(new Date(now * 1000).getUTCFullYear(), 0, 1) / 1000 },
] as const;

export type RangeId = (typeof RANGES)[number]['id'];

/** Far enough back for every range; in January, the last 30 days reach into last year */
export const earliestStart = (now: number) => Math.min(...RANGES.map((range) => range.start(now)));

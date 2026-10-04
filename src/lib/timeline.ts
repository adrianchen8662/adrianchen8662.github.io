import { getCollection, type CollectionEntry } from 'astro:content';
import { inProgress, monthNumber, yearOf } from './dates';

export type TimelineEntry = CollectionEntry<'timeline'>['data'];

/** One card on the timeline: a single entry, or every job at one organization */
export interface TimelineItem {
  kind: TimelineEntry['kind'];
  organization: string;
  type?: string;
  location?: string;
  start: string;
  /** The latest end date; left out while one of its entries has no end */
  end?: string;
  /** Newest first */
  entries: TimelineEntry[];
}

export interface TimelineYear {
  /** "Now" for things still going on (including expected finishes), otherwise the year they ended */
  label: string;
  items: TimelineItem[];
}

const endKey = (end?: string) => (end ? monthNumber(end, 'end') : Infinity);

/** Most recent first: by end (ongoing first), then by start */
function byRecency(a: { start: string; end?: string }, b: { start: string; end?: string }) {
  return endKey(b.end) - endKey(a.end) || monthNumber(b.start, 'start') - monthNumber(a.start, 'start');
}

export async function getTimeline(): Promise<TimelineYear[]> {
  const entries = (await getCollection('timeline')).map((entry) => entry.data);

  // Jobs at the same organization share a card, like LinkedIn's experience section
  const items: TimelineItem[] = [];
  for (const entry of entries) {
    const sameEmployer =
      entry.kind === 'work' && items.find((item) => item.kind === 'work' && item.organization === entry.organization);
    if (sameEmployer) sameEmployer.entries.push(entry);
    else items.push({ kind: entry.kind, organization: entry.organization, start: entry.start, end: entry.end, entries: [entry] });
  }

  for (const item of items) {
    item.entries.sort(byRecency);
    item.type = item.entries.find((e) => e.type)?.type;
    item.location = item.entries.find((e) => e.location)?.location;
    item.start = item.entries.reduce((earliest, e) =>
      monthNumber(e.start, 'start') < monthNumber(earliest.start, 'start') ? e : earliest,
    ).start;
    item.end = item.entries[0].end;
  }
  items.sort(byRecency);

  const years: TimelineYear[] = [];
  for (const item of items) {
    const label = inProgress(item.end) ? 'Now' : String(yearOf(item.end!));
    const last = years.at(-1);
    if (last?.label === label) last.items.push(item);
    else years.push({ label, items: [item] });
  }
  return years;
}

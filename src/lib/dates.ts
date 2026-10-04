// Dates in the timeline are YYYY-MM or YYYY. Kept free of astro:content so the browser can use it too.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function split(value: string) {
  const [year, month] = value.split('-').map(Number);
  return { year, month: month || undefined };
}

export function yearOf(value: string) {
  return split(value).year;
}

/** Months since year 0, for ordering; a bare year counts as its first month at the start and its last at the end */
export function monthNumber(value: string, edge: 'start' | 'end') {
  const { year, month } = split(value);
  return year * 12 + (month ?? (edge === 'start' ? 1 : 12)) - 1;
}

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatYearMonth(value: string) {
  const { year, month } = split(value);
  return month ? `${MONTHS[month - 1]} ${year}` : String(year);
}

export function formatRange(start: string, end?: string) {
  return `${formatYearMonth(start)} – ${end ? formatYearMonth(end) : 'Present'}`;
}

/** Length the way LinkedIn shows it ("2 yrs 4 mos"), counting both end months; empty for bare years */
export function formatDuration(start: string, end: string) {
  if (!start.includes('-') || !end.includes('-')) return '';
  const months = monthNumber(end, 'end') - monthNumber(start, 'start') + 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years && `${years} yr${years > 1 ? 's' : ''}`, rest && `${rest} mo${rest > 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' ');
}

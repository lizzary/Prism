// The statistics page's rules: what a database folder is made of, how file sizes fall into buckets, the file types
// told apart, and the arithmetic of the daily activity record (streaks, moving averages, ranges of days).
// Everything here is pure; the backend counts, the UI draws.

/**
 * The parts of a database folder, in the order they are drawn: the files themselves; what Prism makes from them —
 * previews (the high, medium and low copies pages are browsed with), the database (tags, metadata, notes, colour
 * groups, page settings) and the image index (searching with words or a picture) —; and the data backup history.
 */
export const STORAGE_PARTS = ['files', 'previews', 'database', 'index', 'snapshots'];

/** File sizes, in buckets that grow fourfold: < 256 KB · 256 KB–1 MB · 1–4 MB · 4–16 MB · 16–64 MB · ≥ 64 MB. */
const KB = 1024, MB = 1024 * 1024;
export const SIZE_BUCKETS = [
  { id: 'b0', min: 0, max: 256 * KB },
  { id: 'b1', min: 256 * KB, max: MB },
  { id: 'b2', min: MB, max: 4 * MB },
  { id: 'b3', min: 4 * MB, max: 16 * MB },
  { id: 'b4', min: 16 * MB, max: 64 * MB },
  { id: 'b5', min: 64 * MB, max: Infinity },
];
export const bucketOf = (size) => SIZE_BUCKETS.findIndex((b) => size < b.max);

/** File types told apart (each keeps its colour wherever it is drawn); the rest are counted together as 'other'. */
export const FILE_TYPES = ['png', 'jpg', 'webp', 'gif', 'mp4', 'webm'];
export const OTHER_TYPE = 'other';
export function typeOf(ext) {
  const e = String(ext ?? '').toLowerCase();
  if (e === 'jpeg') return 'jpg';
  return FILE_TYPES.includes(e) ? e : OTHER_TYPE;
}

/** What the activity record counts per day (the page draws these). */
export const ACTIVITY_METRICS = ['time', 'added', 'opened'];
/** Ranges of the activity charts, in days ('all': since the record began). */
export const ACTIVITY_RANGES = { d30: 30, d90: 90, y1: 365, all: Infinity };
export const DEFAULT_RANGE = 'd90';

/** Local calendar day "YYYY-MM-DD" of a moment (a Date, a time in ms, or an ISO string as the backend writes them). */
export function dayOf(at) {
  if (typeof at === 'string') return at.slice(0, 10);
  const d = at instanceof Date ? at : new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** The day `n` days after `day` (n may be negative). */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + n, 12));
}
/** Whole days from `a` to `b` (both "YYYY-MM-DD"). */
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
/** Monday 0 … Sunday 6. */
export function weekdayOf(day) {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(y, m - 1, d, 12).getDay() + 6) % 7;
}

/** A day counts as one with Prism when it was in use for a minute or more. */
export const usedOn = (rec) => (rec?.seconds ?? 0) >= 60;

/**
 * Runs of days with Prism, over records oldest first ending today: { current (ending today — or yesterday, while
 * today has not begun), longest, longestEnd (its last day) }.
 */
export function streaks(days) {
  let run = 0, longest = 0, longestEnd = null;
  for (const d of days) {
    run = usedOn(d) ? run + 1 : 0;
    if (run > longest) { longest = run; longestEnd = d.day; }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (usedOn(days[i])) current++;
    else if (i === days.length - 1) continue;          // today has not had its minute yet: yesterday's run still holds
    else break;
  }
  return { current, longest, longestEnd };
}

/** The mean of each value and the `n − 1` before it (fewer at the start). */
export function movingAverage(values, n = 7) {
  const out = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out[i] = sum / Math.min(n, i + 1);
  }
  return out;
}

/** The value of a day's record for a metric. */
export function metricOf(rec, metric) {
  if (!rec) return 0;
  if (metric === 'time') return Math.round((rec.seconds ?? 0) / 60);
  return rec[metric] ?? 0;
}

/** The middle value (sizes are given sorted ascending). */
export function median(sorted) {
  if (!sorted.length) return 0;
  const k = sorted.length >> 1;
  return sorted.length % 2 ? sorted[k] : (sorted[k - 1] + sorted[k]) / 2;
}

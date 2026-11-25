// A file's index: what Prism builds from it so it can be found — its tags (made by a tagging model), its image index
// (made by an image index model: searching with words or with a picture) and its metadata (sizes, dates, ComfyUI
// parameters). Whether a file's index of a kind is up to date is the backend's to say; here are the kinds, the
// indexing settings (config.toml) and the arithmetic of the reminders, which the backend follows.

export const INDEX_KINDS = ['tagging', 'embedding', 'metadata'];
/** The kinds a model the user chooses builds (metadata needs none). */
export const MODEL_KINDS = ['tagging', 'embedding'];

/**
 * A file's index of one kind:
 *   done (up to date) · stale (outdated: made by another model, or the file changed since) · missing (not indexed yet) ·
 *   failed (the file could not be read) · queued (an index task is building it now) · off (no model to build it is in use)
 */
export const INDEX_STATES = ['done', 'stale', 'missing', 'failed', 'queued', 'off'];
/** What is still to be built — a file with any of these (of a kind that can be built) is waiting. */
export const NEEDS_WORK = ['stale', 'missing', 'failed'];

export const RULE_LIMITS = { count: [1, 9999], hours: [1, 8760] };

/**
 * upload: index files as they are uploaded — trying these kinds (one with no model in use is skipped).
 * auto: on — the switch that pauses every rule and keeps them as they are; each rule: on, its number, and what happens
 *   when it is met: remind (a reminder that leads to the index page) and/or background (index the waiting files).
 *   backlog: at least `count` files are waiting · age: nothing has been indexed for more than `hours`.
 */
export const DEFAULT_INDEXING = {
  upload: { on: true, kinds: ['tagging', 'embedding', 'metadata'] },
  auto: {
    on: true,
    backlog: { on: true, count: 10, remind: true, background: false },
    age: { on: true, hours: 168, remind: true, background: false },
  },
};

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const whole = (v, [lo, hi], d) => (v != null && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);

/** The indexing settings, whole and within bounds, whatever was stored. */
export function cleanIndexing(x) {
  const d = DEFAULT_INDEXING;
  const u = x?.upload ?? {}, a = x?.auto ?? {};
  const rule = (r = {}, def, key) => ({
    on: bool(r.on, def.on),
    [key]: whole(r[key], RULE_LIMITS[key], def[key]),
    remind: bool(r.remind, def.remind),
    background: bool(r.background, def.background),
  });
  return {
    upload: { on: bool(u.on, d.upload.on), kinds: Array.isArray(u.kinds) ? INDEX_KINDS.filter((k) => u.kinds.includes(k)) : [...d.upload.kinds] },
    auto: { on: bool(a.on, d.auto.on), backlog: rule(a.backlog, d.auto.backlog, 'count'), age: rule(a.age, d.auto.age, 'hours') },
  };
}

/**
 * The waiting-files rule reminds each time the number of waiting files reaches another multiple of its number — never
 * oftener than every five files: the step is the larger of the two (at 1, every 5 files; at 10, every 10).
 */
export const REMIND_EVERY_MIN = 5;
export const remindStep = (count) => Math.max(REMIND_EVERY_MIN, count);
/**
 * Which multiple the waiting files have reached. A reminder comes when it goes up — once, however many multiples a
 * single change (a batch of uploads) passes.
 */
export const backlogLevel = (waiting, count) => Math.floor(waiting / remindStep(count));
/** The multiple the next reminder comes at. */
export const nextReminderAt = (waiting, count) => (backlogLevel(waiting, count) + 1) * remindStep(count);

/** The time rule reminds at most once a day while it holds. */
export const AGE_REMIND_EVERY_H = 24;
/** Hours since a moment ('YYYY-MM-DDTHH:mm', local); never → Infinity. */
export const hoursSince = (iso, now = Date.now()) => (iso ? Math.max(0, (now - Date.parse(iso)) / 3_600_000) : Infinity);

/**
 * Whether each rule holds now (with automatic indexing on). The time rule needs something waiting: with every file
 * up to date there is nothing to remind of, however long ago the last indexing was.
 */
export function rulesMet(settings, { waiting, lastIndexedAt, now = Date.now() }) {
  const a = settings.auto;
  return {
    backlog: a.on && a.backlog.on && waiting >= a.backlog.count,
    age: a.on && a.age.on && waiting > 0 && hoursSince(lastIndexedAt, now) > a.age.hours,
  };
}

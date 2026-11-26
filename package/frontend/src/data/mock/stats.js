// The statistics page's backend: what the database folder is made of (and how much room its drive has left), each
// group's and colour group's share, the files by size and type, and the activity record.
//
// The activity record is the one thing Prism keeps for this page alone — a row a day: time in Prism, files opened,
// files added and removed, and the gallery's size at the end of the day (the Go service: an `activity_days` table,
// filled in as things happen; a database from before it existed is backfilled from its files' import dates). Everything
// else is worked out from what the database holds already. Topic: 'activity' (time in Prism, files opened).
import { emit, onChange, currentLibrary, openedLibrary, onLibraryOpen, orderedGroups, coverOf, fileRef } from './backend.js';
import { historyOf } from './snapshots.js';
import { seeded } from '../domain/random.js';
import { NONE } from '../domain/arrange.js';
import { STORAGE_PARTS, SIZE_BUCKETS, FILE_TYPES, OTHER_TYPE, bucketOf, typeOf, dayOf, addDays, daysBetween, weekdayOf, streaks, median } from '../domain/stats.js';

const VIDEO_TYPES = new Set(['mp4', 'webm']);
const today = () => dayOf(Date.now());

// ------------------------------------------------------------------ the database folder
/** The previews Prism keeps of a file: the high, medium and low copies pages are browsed with (a video's: of its poster). */
const PREVIEW_SIDES = [1600, 800, 400];
function previewBytes(f) {
  const long = Math.max(f.width, f.height) || 1;
  let px = 0;
  for (const side of PREVIEW_SIDES) { const k = Math.min(1, side / long); px += f.width * f.height * k * k; }
  return Math.round(px * 0.14) + 2_048;
}
/** A file's rows in prism.db: its record, tags, ComfyUI parameters and note (with SQLite's own overhead). */
function rowBytes(f) {
  const tags = (f.tags?.length ?? 0) + (f.userTags?.length ?? 0);
  const comfy = f.comfy ? (f.comfy.positive?.length ?? 0) + (f.comfy.negative?.length ?? 0) + 260 : 0;
  return 620 + tags * 34 + comfy + (f.note?.length ?? 0) * 3;
}
/** One image-index vector (1152 numbers) and its row. */
const VECTOR_BYTES = 1152 * 4 + 96;

/** The drives the mock knows: their size, and what other things on them take. */
const DRIVES = {
  'C:': { total: 511_101_022_208, used: 318_400_000_000 },
  'D:': { total: 1_000_202_039_296, used: 486_300_000_000 },
  'E:': { total: 2_000_381_014_016, used: 1_288_000_000_000 },
};

/** → { path, total, parts: [{ id, bytes }] (STORAGE_PARTS), drive: { name, total, free }, files, videos, groups, growth } */
export function getStorage() {
  const L = currentLibrary();
  let files = 0, previews = 0, rows = 0, vectors = 0, videos = 0;
  for (const f of L.files) {
    files += f.size;
    previews += previewBytes(f);
    rows += rowBytes(f);
    if (f.kind === 'video') videos++;
    if (f.index?.embedding && !f.index.embedding.failed) vectors++;
  }
  const database = Math.round((rows + L.groups.length * 3_200 + 196_608) * 1.32);
  const parts = { files, previews, database, index: vectors * VECTOR_BYTES, snapshots: historyOf(L).bytes };
  const total = STORAGE_PARTS.reduce((n, k) => n + parts[k], 0);
  const name = L.path.slice(0, 2).toUpperCase();
  const disk = DRIVES[name] ?? DRIVES['D:'];
  // how the gallery has grown over the last 30 days (by the activity record)
  const S = statsOf(L);
  const then = recordAt(S, addDays(today(), -30));
  return {
    path: L.path, total,
    parts: STORAGE_PARTS.map((id) => ({ id, bytes: parts[id] })),
    drive: { name, total: disk.total, free: Math.max(0, disk.total - disk.used - total) },
    files: L.files.length, videos, groups: L.groups.length,
    growth: { days: 30, files: L.files.length - (then?.files ?? 0), bytes: files - (then?.bytes ?? 0) },
  };
}

// ------------------------------------------------------------------ a scope: the gallery, a group, a colour group
/** A file's colour group in a configuration (its id), or NONE. */
const colorKey = (f, cfg, known) => (cfg && known.has(f.colors?.[cfg.id]) ? f.colors[cfg.id] : NONE);

function tally(files) {
  let bytes = 0, videos = 0;
  const types = new Map();
  const buckets = SIZE_BUCKETS.map((b) => ({ id: b.id, min: b.min, max: Number.isFinite(b.max) ? b.max : null, files: 0, bytes: 0, types: {} }));
  for (const f of files) {
    bytes += f.size;
    if (f.kind === 'video') videos++;
    const t = typeOf(f.ext);
    let e = types.get(t);
    if (!e) types.set(t, (e = { files: 0, bytes: 0, videos: 0 }));
    e.files++; e.bytes += f.size; if (f.kind === 'video') e.videos++;
    const b = buckets[bucketOf(f.size)];
    b.files++; b.bytes += f.size;
    const bt = (b.types[t] ??= { files: 0, bytes: 0 });
    bt.files++; bt.bytes += f.size;
  }
  return {
    bytes, files: files.length, videos, images: files.length - videos, buckets,
    types: [...FILE_TYPES, OTHER_TYPE].filter((t) => types.has(t)).map((t) => {
      const e = types.get(t);
      return { type: t, kind: VIDEO_TYPES.has(t) ? 'video' : t === OTHER_TYPE ? (e.videos === e.files ? 'video' : e.videos ? null : 'image') : 'image', files: e.files, bytes: e.bytes };
    }),
  };
}
const sizes = (files) => Float64Array.from(files, (f) => f.size).sort();
const typeMix = (files) => tally(files).types.map(({ type, files: n, bytes }) => ({ type, files: n, bytes }));

/** The colour groups of a configuration over some files (in its order), then the files in none of them. */
function colorParts(files, cfg) {
  const known = new Set(cfg.groups.map((c) => c.id));
  const by = new Map([...cfg.groups.map((c) => [c.id, []]), [NONE, []]]);
  for (const f of files) by.get(colorKey(f, cfg, known)).push(f);
  const parts = cfg.groups.map((c) => ({ id: c.id, kind: 'color', name: c.name, color: c.color, files: by.get(c.id) }));
  if (by.get(NONE).length) parts.push({ id: NONE, kind: 'none', name: null, color: null, files: by.get(NONE) });
  return parts;
}
const groupRef = (L, g) => { const c = coverOf(L, g); return { id: g.id, name: g.name, cover: c ? fileRef(c) : null }; };
const activeConfig = (g) => g.configs.find((c) => c.id === g.activeConfigId) ?? null;

/** Where a scope points, made good: a group that is gone is the whole gallery again, a colour group that is gone its group. */
function resolve(L, { groupId, configId, colorId } = {}) {
  const g = groupId ? L.groupsById.get(groupId) : null;
  if (!g) return { g: null, cfg: null, color: null };
  const cfg = g.configs.find((c) => c.id === configId) ?? activeConfig(g);
  if (!cfg || !colorId) return { g, cfg, color: null };
  if (colorId === NONE) return { g, cfg, color: { id: NONE, name: null, color: null } };
  const c = cfg.groups.find((x) => x.id === colorId);
  return { g, cfg, color: c ? { id: c.id, name: c.name, color: c.color } : null };
}
function filesIn(L, { g, cfg, color }) {
  if (!g) return L.files;
  const files = L.filesByGroup.get(g.id) ?? [];
  if (!color) return files;
  const known = new Set(cfg.groups.map((c) => c.id));
  return files.filter((f) => colorKey(f, cfg, known) === color.id);
}
const LEAF_TILES = 120;

/**
 * Everything the storage tab shows for a scope. query: { groupId, configId (the configuration a group is split by;
 * its own by default), colorId (NONE: its files in no colour group) }.
 * → { scope: { kind: 'all' | 'group' | 'color', group, config, color }, bytes, files, images, videos, median, mean,
 *     share: { bytes (of the whole it is part of: the gallery's files, or its group) } | null,
 *     configs: [{ id, name, colorGroups, active }] (a group's),
 *     children: groups (all: + parts — the colour groups of the configuration in use) | colour groups (a group) | [] (a colour group),
 *     types, buckets, tiles: the largest files (a group with no colour groups, a colour group) + rest: { files, bytes } }
 */
export function getScope(query) {
  const L = currentLibrary();
  const at = resolve(L, query);
  const files = filesIn(L, at);
  const t = tally(files);
  const sorted = sizes(files);
  const kind = !at.g ? 'all' : at.color ? 'color' : 'group';
  let children = [];
  if (kind === 'all') {
    children = orderedGroups(L).map((g) => {
      const own = L.filesByGroup.get(g.id) ?? [];
      const cfg = activeConfig(g);
      const sum = tally(own);
      return {
        id: g.id, kind: 'group', name: g.name, cover: groupRef(L, g).cover, bytes: sum.bytes, files: sum.files, videos: sum.videos,
        config: cfg ? { id: cfg.id, name: cfg.name } : null, colorGroups: cfg?.groups.length ?? 0, configs: g.configs.length,
        parts: cfg ? colorParts(own, cfg).map((p) => ({ id: p.id, kind: p.kind, name: p.name, color: p.color, files: p.files.length, bytes: p.files.reduce((n, f) => n + f.size, 0) })) : [],
      };
    });
  } else if (kind === 'group' && at.cfg) {
    children = colorParts(files, at.cfg).map((p) => {
      const sum = tally(p.files);
      return { id: p.id, kind: p.kind, name: p.name, color: p.color, bytes: sum.bytes, files: sum.files, videos: sum.videos, types: typeMix(p.files) };
    });
  }
  const leaf = kind === 'color' || (kind === 'group' && !at.cfg);
  const largest = leaf ? [...files].sort((a, b) => b.size - a.size) : [];
  const tiles = largest.slice(0, LEAF_TILES);
  const rest = largest.slice(LEAF_TILES);
  const whole = kind === 'all' ? null : kind === 'group' ? L.files.reduce((n, f) => n + f.size, 0) : (L.filesByGroup.get(at.g.id) ?? []).reduce((n, f) => n + f.size, 0);
  return {
    scope: {
      kind,
      group: at.g ? groupRef(L, at.g) : null,
      config: at.cfg && kind !== 'all' ? { id: at.cfg.id, name: at.cfg.name } : null,
      color: at.color,
    },
    bytes: t.bytes, files: t.files, images: t.images, videos: t.videos,
    median: Math.round(median(sorted)), mean: t.files ? Math.round(t.bytes / t.files) : 0,
    share: whole == null ? null : { bytes: whole },
    configs: at.g ? at.g.configs.map((c) => ({ id: c.id, name: c.name, colorGroups: c.groups.length, active: c.id === at.g.activeConfigId })) : [],
    children, types: t.types, buckets: t.buckets,
    tiles: tiles.map((f) => ({ ...fileRef(f), size: f.size, groupId: f.groupId })),
    rest: { files: rest.length, bytes: rest.reduce((n, f) => n + f.size, 0) },
  };
}

/**
 * A scope's files, the largest first: query as getScope, plus bucket (a SIZE_BUCKETS id) and type (a FILE_TYPES one or
 * 'other'), limit. → { total, bytes, rows: [ref + { size, groupId, group (its name), color: { id, name, color } | null, importedAt }] }
 */
export function getScopeFiles({ bucket = null, type = null, limit = 400, ...query } = {}) {
  const L = currentLibrary();
  const at = resolve(L, query);
  const b = bucket ? SIZE_BUCKETS.findIndex((x) => x.id === bucket) : -1;
  const files = filesIn(L, at).filter((f) => (b < 0 || bucketOf(f.size) === b) && (!type || typeOf(f.ext) === type));
  files.sort((x, y) => y.size - x.size || (x.importedAt < y.importedAt ? 1 : -1));
  // each file's colour group: in the configuration the scope is split by, or (from the whole gallery) its group's own
  const configs = new Map();
  const colorOf = (f) => {
    let e = configs.get(f.groupId);
    if (!e) {
      const g = L.groupsById.get(f.groupId);
      const cfg = at.g?.id === f.groupId && at.cfg ? at.cfg : g ? activeConfig(g) : null;
      configs.set(f.groupId, (e = { cfg, byId: cfg ? new Map(cfg.groups.map((c) => [c.id, c])) : null }));
    }
    const c = e.cfg ? e.byId.get(f.colors?.[e.cfg.id]) : null;
    return c ? { id: c.id, name: c.name, color: c.color } : null;
  };
  return {
    total: files.length,
    bytes: files.reduce((n, f) => n + f.size, 0),
    rows: files.slice(0, limit).map((f) => ({
      ...fileRef(f), size: f.size, groupId: f.groupId, group: L.groupsById.get(f.groupId)?.name ?? '', color: colorOf(f), importedAt: f.importedAt,
    })),
  };
}

// ------------------------------------------------------------------ the activity record
/** A day's row: seconds in Prism, files opened, added and removed that day, and the gallery's files and bytes at its end. */
const blank = (day, files = 0, bytes = 0) => ({ day, seconds: 0, opened: 0, added: 0, removed: 0, files, bytes });

function statsOf(L) {
  if (!L.stats) {
    L.stats = { days: new Map(), first: today(), present: new Set(L.files.map((f) => f.id)), gone: new Map() };
    if (L.seeded) seedHistory(L, L.stats);
    else L.stats.days.set(today(), blank(today(), L.files.length, L.files.reduce((n, f) => n + f.size, 0)));
  }
  return L.stats;
}
/** The row of a day — kept, or (between two kept days) the quiet day it was. */
function recordAt(S, day) {
  if (S.days.has(day)) return S.days.get(day);
  if (day < S.first) return null;
  let d = day;
  for (let i = 0; i < 400 && d >= S.first; i++) { d = addDays(d, -1); const r = S.days.get(d); if (r) return blank(day, r.files, r.bytes); }
  return null;
}
/** Today's row (a new day begins with the totals of the last one). */
function todayOf(L) {
  const S = statsOf(L), key = today();
  let rec = S.days.get(key);
  if (!rec) {
    const last = recordAt(S, addDays(key, -1));
    rec = blank(key, last?.files ?? L.files.length, last?.bytes ?? 0);
    S.days.set(key, rec);
  }
  return rec;
}

/**
 * The sample's record, as months of use leave it: every import of the files still here on its day; now and then a
 * clean-up that deleted a few files (which had come with an earlier import); and time in Prism and files opened —
 * busier and quieter stretches, more at weekends, a few trips away, longer on days with imports.
 */
function seedHistory(L, S) {
  const now = today();
  const imports = new Map();
  for (const f of L.files) {
    const d = dayOf(f.importedAt);
    const e = imports.get(d) ?? { n: 0, bytes: 0 };
    e.n++; e.bytes += f.size;
    imports.set(d, e);
  }
  const first = [...imports.keys(), ...L.groups.map((g) => dayOf(g.createdAt))].reduce((m, d) => (d < m ? d : m), now);
  const span = daysBetween(first, now);
  const importDays = [...imports.keys()].sort();
  // clean-ups: files deleted on a day, which had arrived with an import at least a week before
  const extra = new Map();
  const bump = (day, k, n, b) => { const e = extra.get(day) ?? { added: 0, addedBytes: 0, removed: 0, removedBytes: 0 }; e[k] += n; e[`${k}Bytes`] += b; extra.set(day, e); };
  for (let n = span - 14; n >= 1; n--) {
    const q = seeded(`stats|clean|${n}`);
    if (!q.chance(0.05)) continue;
    const day = addDays(now, -n), before = addDays(day, -7);
    let lo = 0, hi = importDays.length - 1, from = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (importDays[mid] <= before) { from = importDays[mid]; lo = mid + 1; } else hi = mid - 1; }
    if (!from) continue;
    const r = q.int(2, 26), each = Math.round((imports.get(from).bytes / imports.get(from).n) * q.range(0.6, 1.25));
    bump(from, 'added', r, r * each);
    bump(day, 'removed', r, r * each);
  }
  let files = 0, bytes = 0;
  for (let n = span; n >= 0; n--) {
    const day = addDays(now, -n);
    const imp = imports.get(day), ex = extra.get(day);
    const added = (imp?.n ?? 0) + (ex?.added ?? 0), removed = ex?.removed ?? 0;
    files += added - removed;
    bytes += (imp?.bytes ?? 0) + (ex?.addedBytes ?? 0) - (ex?.removedBytes ?? 0);
    S.days.set(day, { day, ...usage(n, day, added, removed), added, removed, files, bytes });
  }
  S.first = first;
}

/** Time in Prism and files opened on day `n` (days ago) of the sample. */
function usage(n, day, added, removed) {
  const q = seeded(`stats|use|${n}`);
  if (n === 0) {
    // earlier today, before this visit
    const hour = new Date().getHours();
    const minutes = hour >= 8 ? q.int(9, 34) : 0;
    return { seconds: minutes * 60, opened: Math.round(minutes * q.range(0.8, 1.8)) };
  }
  const weekend = weekdayOf(day) >= 5;
  const phase = 0.72 + 0.28 * Math.sin((n / 83) * Math.PI * 2 + 1.3);
  const away = (n >= 150 && n <= 161) || (n >= 302 && n <= 309) || (n >= 497 && n <= 503);
  const busy = added + removed > 0;
  if (!busy && !q.chance(away ? 0.03 : (weekend ? 0.76 : 0.48) * phase)) return { seconds: 0, opened: 0 };
  const [lo, hi] = weekend ? [14, 150] : [6, 75];
  let minutes = Math.exp(q.range(Math.log(lo), Math.log(hi))) * (0.7 + phase * 0.4);
  if (busy) minutes += Math.min(80, added * q.range(0.08, 0.3) + removed * 0.5) + q.range(3, 12);
  const seconds = Math.round(minutes * 60);
  return { seconds, opened: Math.round((seconds / 60) * q.range(0.5, 2.6) + added * q.range(0.04, 0.25)) };
}

onLibraryOpen((L) => { statsOf(L); });

/** Files coming and going (an import, an upload, a deletion, its undo, a snapshot loaded) count on the day they do. */
function noteFiles(L) {
  const S = L.stats;
  const now = new Set();
  for (const f of L.files) {
    now.add(f.id);
    if (S.present.has(f.id)) continue;
    const gone = S.gone.get(f.id);
    if (gone) {
      // its deletion undone
      S.gone.delete(f.id);
      const r = S.days.get(gone);
      if (r) r.removed = Math.max(0, r.removed - 1);
    } else todayOf(L).added++;
  }
  for (const id of S.present) {
    if (now.has(id)) continue;
    S.gone.set(id, today());
    todayOf(L).removed++;
  }
  S.present = now;
}
onChange((topic) => {
  const L = openedLibrary();
  if (!L?.stats) return;
  if (topic === 'library') noteFiles(L);
  else if (topic === 'viewed') { todayOf(L).opened++; emit('activity'); }
});

/** Time spent in Prism: the page says so about once a minute while it is in use (at most 90 s at a time). */
export function present(seconds) {
  const L = openedLibrary();
  if (!L) return { ok: false };
  const s = Math.max(0, Math.min(90, Math.round(Number(seconds) || 0)));
  if (s) { todayOf(L).seconds += s; emit('activity'); }
  return { ok: true };
}

/** Today's row with the gallery as it is now. */
function liveToday(L) {
  const rec = todayOf(L);
  rec.files = L.files.length;
  rec.bytes = L.files.reduce((n, f) => n + f.size, 0);
  return rec;
}

/**
 * The whole record, a row for every day from its first to today (oldest first).
 * → { first, today, days: [{ day, seconds, opened, added, removed, files, bytes }], streak: { current, longest, longestEnd },
 *     snapshots: [{ id, name, at }] (the data backup's timeline, to mark on it) }
 */
export function getActivity() {
  const L = currentLibrary();
  const S = statsOf(L);
  liveToday(L);
  const days = [];
  let carry = null;
  for (let d = S.first, i = 0; d <= today() && i < 4000; d = addDays(d, 1), i++) {
    const r = S.days.get(d) ?? blank(d, carry?.files ?? 0, carry?.bytes ?? 0);
    days.push(r);
    carry = r;
  }
  return { first: S.first, today: today(), days, streak: streaks(days), snapshots: historyOf(L).snapshots.map(({ id, name, at }) => ({ id, name, at })) };
}

/**
 * One day: its row, the files added that day that are still here — by group (in the gallery's order), the newest first —
 * and the snapshots taken that day.
 * → { day, record, groups: [{ id, name, cover, count, bytes, files: [ref] (12 at most) }], kept (of those added), snapshots }
 */
export function getDay(day) {
  const L = currentLibrary();
  const S = statsOf(L);
  if (day === today()) liveToday(L);
  const record = recordAt(S, day) ?? blank(day);
  const by = new Map();
  for (const f of L.files) {
    if (dayOf(f.importedAt) !== day) continue;
    if (!by.has(f.groupId)) by.set(f.groupId, []);
    by.get(f.groupId).push(f);
  }
  const groups = orderedGroups(L).filter((g) => by.has(g.id)).map((g) => {
    const list = by.get(g.id).sort((a, b) => (a.importedAt < b.importedAt ? 1 : a.importedAt > b.importedAt ? -1 : 0));
    return { ...groupRef(L, g), count: list.length, bytes: list.reduce((n, f) => n + f.size, 0), files: list.slice(0, 12).map(fileRef) };
  });
  return {
    day, record, groups,
    kept: groups.reduce((n, g) => n + g.count, 0),
    snapshots: historyOf(L).snapshots.filter((s) => dayOf(s.at) === day).map(({ id, name, at }) => ({ id, name, at })),
  };
}

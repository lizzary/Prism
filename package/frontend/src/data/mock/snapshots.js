// Snapshots of the database directory — the data-security timeline. Topic: 'snapshots'.
// The Go service keeps them as the version history of the whole folder (the storage figure is that history's size).
// Here each snapshot remembers which groups and files it holds; loading one rebuilds the gallery from them, so
// whatever was never saved in a snapshot is gone afterwards — exactly what the UI warns about.
// A snapshot is taken per group: only the chosen groups' changes go in, the others stay as they were saved before.
import {
  emit, currentLibrary, reindex, registerTaskType, newTask, finish, fsAddFile, fsFile, getConfig, newEdits, fileRef, coverOf,
} from './backend.js';
import { daysAgo, isoOf } from './seed.js';
import { hashString } from '../domain/random.js';

const nowIso = () => isoOf(new Date());
const LIST_LIMIT = 48;      // items returned per change group
const FILE_LIMIT = 400;     // rows returned per change list
const ARCHIVE_EXT = 'prsnap';

// ------------------------------------------------------------------ state
function state(L) {
  if (!L.backup) {
    L.backup = { snapshots: [], head: null, busy: null, cache: new Map() };
    if (L.seeded) seedHistory(L);
  }
  return L.backup;
}
const visible = (B) => B.snapshots.filter((s) => !s.hidden);
const snapId = (L, salt) => `s_${hashString(`${L.path}|${salt}`).toString(36)}`;
const capture = (L) => ({ files: new Set(L.files.map((f) => f.id)), groups: new Set(L.groups.map((g) => g.id)) });
/** The gallery as it was at `iso`, judged by when each group was created and each file imported. */
const asOf = (L, iso) => ({
  files: new Set(L.files.filter((f) => f.importedAt <= iso).map((f) => f.id)),
  groups: new Set(L.groups.filter((g) => g.createdAt <= iso).map((g) => g.id)),
});
const describe = (s) => ({ id: s.id, name: s.name, createdAt: s.createdAt, files: [...s.files], groups: [...s.groups] });

// ------------------------------------------------------------------ the sample gallery's history
const L2 = (zh, en) => ({ 'zh-CN': zh, en });
const HISTORY = [
  [141, 21, 12, L2('第一次备份', 'First backup')],
  [119, 22, 5, null],
  [97, 20, 48, L2('换新电脑之前', 'Before moving to the new PC')],
  [76, 23, 16, null],
  [58, 21, 37, L2('大批导入之前', 'Before a big import')],
  [41, 22, 2, null],
  [27, 20, 30, L2('月度备份', 'Monthly backup')],
  [14, 21, 51, L2('整理颜色组之前', 'Before sorting colour groups')],
  [3, 21, 30, null],
];
const ARCHIVED = [
  [236, 20, 40, L2('旧图归档之前', 'Before archiving old pictures')],
  [205, 22, 18, null],
  HISTORY[0],
];
const FILE_FIELDS = ['userTags', 'note', 'colors'];
const GROUP_FIELDS = ['name', 'coverFileId'];

function seedHistory(L) {
  const B = L.backup;
  const lang = getConfig().language;
  const named = (n) => (n ? n[lang] ?? n.en : null);
  for (const [d, h, m, name] of HISTORY) {
    const at = daysAgo(d, h, m);
    B.snapshots.push({ id: snapId(L, at), name: named(name), createdAt: at, source: 'created', hidden: false, ...asOf(L, at) });
  }
  B.head = B.snapshots.at(-1).id;
  // edits made since the last snapshot, so the current state shows more than new files:
  // a few night pictures sorted into "精选", a renamed group, a new cover
  const before = (o, keys) => structuredClone(Object.fromEntries(keys.map((k) => [k, o[k]])));
  const starry = L.groupsById.get('g_starry');
  const rating = starry?.configs[1];
  const saved = (L.filesByGroup.get('g_starry') ?? []).filter((f) => f.importedAt <= B.snapshots.at(-1).createdAt);
  for (const f of saved.slice(4, 10)) {
    L.edits.files.set(f.id, before(f, FILE_FIELDS));
    if (rating) f.colors = { ...f.colors, [rating.id]: rating.groups[0].id };
  }
  const flux = L.groupsById.get('g_flux');
  if (flux) { L.edits.groups.set(flux.id, { ...before(flux, GROUP_FIELDS), name: 'FLUX dev 测试' }); }
  const chara = L.groupsById.get('g_chara');
  const other = L.filesByGroup.get('g_chara')?.[12];
  if (chara && other) L.edits.groups.set(chara.id, { ...before(chara, GROUP_FIELDS), coverFileId: other.id });
  L.edits.prefs = true;
  L.docs = null;
  // an archive exported months ago waits in the backup folder
  const old = ARCHIVED.map(([d, h, m, name]) => { const at = daysAgo(d, h, m); return { id: snapId(L, at), name: named(name), createdAt: at }; });
  fsAddFile('D:\\Prism\\backup', { name: `Prism-snapshots-${old.at(-1).createdAt.slice(0, 10)}.${ARCHIVE_EXT}`, size: 6_870_000_000, modifiedAt: daysAgo(140, 9, 26), snapshots: old });
}

// ------------------------------------------------------------------ lookups (a removed group or file may still be held by a snapshot)
const fileOf = (L, id) => L.filesById.get(id) ?? L.vault.files.get(id) ?? null;
const groupOf = (L, id) => L.groupsById.get(id) ?? L.vault.groups.get(id) ?? null;
const newest = (L, ids) => ids.map((id) => fileOf(L, id)).filter(Boolean).sort((a, b) => b.importedAt.localeCompare(a.importedAt));
const groupChip = (L, id) => { const g = groupOf(L, id); return g ? { id: g.id, name: g.name } : null; };

// ------------------------------------------------------------------ differences
const minus = (a, b) => [...a].filter((x) => !b.has(x));
const EMPTY = { files: new Set(), groups: new Set() };

/** What changed from `base` (a snapshot, or nothing) to `to` (a snapshot, or 'working' = the database folder now). */
function diff(L, base, to) {
  const working = to === 'working';
  const cur = working ? capture(L) : to;
  const from = base ?? EMPTY;
  const edited = working ? { files: [...L.edits.files.keys()], groups: [...L.edits.groups.keys()], prefs: L.edits.prefs } : (to.edited ?? { files: [], groups: [], prefs: false });
  const kind = (k) => ({ added: minus(cur[k], from[k]), deleted: minus(from[k], cur[k]), modified: edited[k].filter((id) => from[k].has(id) && cur[k].has(id)) });
  return { files: kind('files'), groups: kind('groups'), prefs: !!base && edited.prefs };
}
function summarize(d) {
  const sum = (k) => d.files[k].length + d.groups[k].length;
  const added = sum('added'), deleted = sum('deleted'), modified = sum('modified') + (d.prefs ? 1 : 0);
  const of = (k) => ({ added: d[k].added.length, modified: d[k].modified.length, deleted: d[k].deleted.length });
  return { total: added + deleted + modified, added, modified, deleted, files: of('files'), groups: of('groups') };
}

const fileItem = (L, f) => ({ id: f.id, file: fileRef(f), group: groupChip(L, f.groupId), inLibrary: L.filesById.has(f.id) });
const groupItem = (L, g) => { const c = coverOf(L, g); return { id: g.id, name: g.name, cover: c ? fileRef(c) : null, inLibrary: L.groupsById.has(g.id) }; };
function changeGroups(L, d) {
  const out = [];
  for (const change of ['added', 'modified', 'deleted']) {
    const ids = d.groups[change];
    if (ids.length) out.push({ kind: 'group', change, count: ids.length, items: ids.slice(0, LIST_LIMIT).map((id) => groupOf(L, id)).filter(Boolean).map((g) => groupItem(L, g)) });
  }
  for (const change of ['added', 'modified', 'deleted']) {
    const ids = d.files[change];
    if (ids.length) out.push({ kind: 'file', change, count: ids.length, items: newest(L, ids).slice(0, LIST_LIMIT).map((f) => fileItem(L, f)) });
  }
  if (d.prefs) out.push({ kind: 'settings', change: 'modified', count: 1, items: [] });
  return out;
}

/** The same changes as files of the database folder (the Go service reports these; the UI maps them back). */
function fileRows(L, d) {
  const rows = [];
  if (summarize(d).total) rows.push({ path: 'prism.db', change: 'modified' });
  for (const change of ['added', 'deleted']) {
    for (const f of newest(L, d.files[change])) rows.push({ path: `files\\${f.groupId}\\${f.name}.${f.ext}`, change });
  }
  return { total: rows.length, items: rows.slice(0, FILE_LIMIT) };
}

/** A strip of what a snapshot saved: the newest files it added, filled up with its newest files. */
function previews(L, s, prev) {
  const pics = newest(L, prev ? minus(s.files, prev.files) : [...s.files]).filter((f) => f.kind === 'image').slice(0, 4);
  if (pics.length < 4) pics.push(...newest(L, [...s.files]).filter((f) => f.kind === 'image' && !pics.includes(f)).slice(0, 4 - pics.length));
  return pics.map(fileRef);
}

/** The size of the history: every file any snapshot holds, once. */
function storageOf(L) {
  const ids = new Set();
  for (const s of state(L).snapshots) for (const id of s.files) ids.add(id);
  let bytes = 0;
  for (const id of ids) bytes += fileOf(L, id)?.size ?? 0;
  return Math.round(bytes * 0.97) + ids.size * 2_048 + state(L).snapshots.length * 65_536;
}

/** Only the part of a difference that belongs to the chosen groups; page settings belong to the whole gallery. */
function scoped(L, d, sel) {
  const mine = (ids) => ids.filter((id) => sel.has(fileOf(L, id)?.groupId));
  const theirs = (ids) => ids.filter((id) => sel.has(id));
  return {
    files: { added: mine(d.files.added), deleted: mine(d.files.deleted), modified: mine(d.files.modified) },
    groups: { added: theirs(d.groups.added), deleted: theirs(d.groups.deleted), modified: theirs(d.groups.modified) },
    prefs: d.prefs,
  };
}
/** Unsaved changes per group (a removed group still counts, so its removal can be saved), and the gallery-wide ones. */
function pendingByGroup(L, d) {
  const count = new Map();
  const add = (id) => { if (id) count.set(id, (count.get(id) ?? 0) + 1); };
  for (const k of ['added', 'deleted', 'modified']) {
    for (const id of d.files[k]) add(fileOf(L, id)?.groupId);
    for (const id of d.groups[k]) add(id);
  }
  return {
    groups: [...count].flatMap(([id, changes]) => {
      const g = groupOf(L, id);
      return g ? [{ ...groupItem(L, g), removed: !L.groupsById.has(id), changes }] : [];
    }),
    shared: d.prefs ? 1 : 0,
  };
}

// ------------------------------------------------------------------ reading
const head = (B) => B.snapshots.find((s) => s.id === B.head) ?? null;

export function getBackup() {
  const L = currentLibrary(), B = state(L);
  const shown = visible(B);
  const working = diff(L, head(B), 'working');
  // a snapshot never changes, and neither does what it saved over the one before it
  const between = (s, prev) => {
    const key = `${prev?.id ?? ''}>${s.id}`;
    if (!B.cache.has(key)) B.cache.set(key, { changes: summarize(diff(L, prev, s)), previews: previews(L, s, prev) });
    return B.cache.get(key);
  };
  return {
    dbPath: L.path,
    storage: storageOf(L),
    head: B.head,
    busy: B.busy,
    current: { groups: L.groups.length, files: L.files.length },
    pending: { ...summarize(working), ...pendingByGroup(L, working) },
    snapshots: shown.map((s, i) => ({
      id: s.id, name: s.name, createdAt: s.createdAt, source: s.source,
      totals: { groups: s.groups.size, files: s.files.size },
      ...between(s, shown[i - 1] ?? null),
    })),
  };
}

/** id: a snapshot (what it saved compared with the one before it) or 'working' (the folder now, against the current snapshot). */
export function getChanges(id) {
  const L = currentLibrary(), B = state(L);
  const shown = visible(B);
  let base, to;
  if (id === 'working') { base = head(B); to = 'working'; }
  else {
    const i = shown.findIndex((s) => s.id === id);
    if (i < 0) return null;
    base = shown[i - 1] ?? null; to = shown[i];
  }
  const d = diff(L, base, to);
  return { base: base ? { id: base.id, name: base.name, createdAt: base.createdAt } : null, summary: summarize(d), groups: changeGroups(L, d), files: fileRows(L, d) };
}

// ------------------------------------------------------------------ creating
/**
 * Save the chosen groups' changes on top of the current snapshot. Other groups keep what that snapshot held, and
 * their changes stay unsaved; page settings belong to the whole gallery and always go in.
 */
function commit(L, name, sel) {
  const B = state(L);
  const base = head(B) ?? EMPTY;
  const cur = capture(L);
  const gid = (id) => fileOf(L, id)?.groupId;
  const files = new Set([...base.files].filter((id) => !sel.has(gid(id))));
  for (const id of cur.files) if (sel.has(gid(id))) files.add(id);
  const groups = new Set([...base.groups].filter((id) => !sel.has(id)));
  for (const id of cur.groups) if (sel.has(id)) groups.add(id);
  const editedFiles = [...L.edits.files.keys()].filter((id) => sel.has(gid(id)));
  const editedGroups = [...L.edits.groups.keys()].filter((id) => sel.has(id));
  const at = nowIso();
  const s = {
    id: snapId(L, `${at}|${B.snapshots.length}|${Math.random()}`), name: name || null, createdAt: at, source: 'created', hidden: false,
    files, groups, edited: { files: editedFiles, groups: editedGroups, prefs: L.edits.prefs },
  };
  B.snapshots.push(s);
  B.head = s.id;
  for (const id of editedFiles) L.edits.files.delete(id);
  for (const id of editedGroups) L.edits.groups.delete(id);
  L.edits.prefs = false;
  return s;
}
/** Every group with something to save, including removed ones. */
const everyone = (L) => new Set([...L.groups.map((g) => g.id), ...pendingByGroup(L, diff(L, head(state(L)), 'working')).groups.map((g) => g.id)]);

/** groupIds: whose changes go into the snapshot (required). */
export function createSnapshot(name, groupIds) {
  const L = currentLibrary(), B = state(L);
  if (B.busy) return { ok: false, error: 'busy' };
  const sel = new Set(groupIds ?? []);
  if (!sel.size) return { ok: false, error: 'groups' };
  const d = scoped(L, diff(L, head(B), 'working'), sel);
  if (!summarize(d).total) return { ok: false, error: 'nothing' };
  const label = String(name ?? '').trim() || null;
  const t = newTask(L, { type: 'snapshot', label, name: label, groupIds: [...sel], total: Math.max(1, fileRows(L, d).total) });
  B.busy = t.id;
  emit('snapshots');
  return { ok: true, taskId: t.id };
}

registerTaskType('snapshot', {
  lane: 'backup', firstStage: 'scanning',
  step(t) {
    if (t.stage === 'scanning') { t.stage = 'saving'; t.nextAt = Date.now() + 500; emit('tasks'); return; }
    t.processed = Math.min(t.total, t.processed + Math.max(1, Math.ceil(t.total / 26)));
    if (t.processed < t.total) { t.nextAt = Date.now() + 110; emit('tasks'); return; }
    const s = commit(t.lib, t.name, new Set(t.groupIds));
    t.lib.backup.busy = null;
    finish(t, 'done', { result: { changes: t.total, id: s.id } });
    emit('snapshots');
  },
  end(t) { if (t.state !== 'done' && t.lib.backup?.busy === t.id) { t.lib.backup.busy = null; emit('snapshots'); } },
});

// ------------------------------------------------------------------ loading
/** Rebuild the gallery from a snapshot. Anything held by no snapshot is dropped; uncommitted edits are undone. */
function restore(L, s) {
  const B = state(L);
  const kept = { files: new Set(), groups: new Set() };
  for (const x of B.snapshots) for (const k of Object.keys(kept)) for (const id of x[k]) kept[k].add(id);

  for (const [id, before] of L.edits.files) { const f = fileOf(L, id); if (f) Object.assign(f, before); }
  for (const [id, before] of L.edits.groups) { const g = groupOf(L, id); if (g) Object.assign(g, before); }
  L.edits = newEdits();

  const swap = (list, ids, vault, keep) => {
    const next = [];
    for (const x of list) { if (ids.has(x.id)) next.push(x); else if (keep.has(x.id)) vault.set(x.id, x); }
    for (const id of ids) if (!next.some((x) => x.id === id) && vault.has(id)) { next.push(vault.get(id)); vault.delete(id); }
    return next;
  };
  L.groups = swap(L.groups, s.groups, L.vault.groups, kept.groups);
  L.files = swap(L.files, s.files, L.vault.files, kept.files);
  reindex(L);
}

export function loadSnapshot(id, { saveFirst = false } = {}) {
  const L = currentLibrary(), B = state(L);
  const s = B.snapshots.find((x) => x.id === id);
  if (!s || B.busy) return { ok: false };
  if (saveFirst && summarize(diff(L, head(B), 'working')).total) commit(L, null, everyone(L));
  restore(L, s);
  B.head = s.id;
  emit('snapshots'); emit('library');
  return { ok: true };
}

// ------------------------------------------------------------------ removing (from the timeline)
export function hideSnapshot(id) {
  const B = state(currentLibrary());
  const s = B.snapshots.find((x) => x.id === id);
  if (!s || id === B.head) return { ok: false };
  s.hidden = true;
  emit('snapshots');
  return { ok: true };
}
export function unhideSnapshot(id) {
  const s = state(currentLibrary()).snapshots.find((x) => x.id === id);
  if (s) { s.hidden = false; emit('snapshots'); }
  return { ok: !!s };
}

// ------------------------------------------------------------------ export & import
export function exportSnapshots({ ids, dir }) {
  const L = currentLibrary(), B = state(L);
  const list = visible(B).filter((s) => ids.includes(s.id));
  if (!list.length || !String(dir ?? '').trim()) return { ok: false };
  const t = newTask(L, { type: 'snapshot-export', total: list.length * 6, ids: list.map((s) => s.id), dir: dir.trim() });
  return { ok: true, taskId: t.id };
}
registerTaskType('snapshot-export', {
  lane: 'backup', firstStage: 'packing',
  step(t) {
    t.processed++;
    if (t.processed < t.total) { t.nextAt = Date.now() + 150; emit('tasks'); return; }
    const list = state(t.lib).snapshots.filter((s) => t.ids.includes(s.id));
    const file = fsAddFile(t.dir, { name: `Prism-snapshots-${nowIso().slice(0, 10)}.${ARCHIVE_EXT}`, size: storageOf(t.lib), modifiedAt: nowIso(), snapshots: list.map(describe) });
    finish(t, 'done', { result: { count: list.length, file } });
  },
});

/** What an archive holds, and which of it is already on the timeline. */
export function inspectArchive(path) {
  const f = fsFile(path);
  if (!f?.snapshots) return { ok: false };
  const B = state(currentLibrary());
  return {
    ok: true, path, name: f.name, size: f.size, modifiedAt: f.modifiedAt,
    snapshots: f.snapshots.map((d) => {
      const has = B.snapshots.find((s) => s.id === d.id);
      return { id: d.id, name: d.name, createdAt: d.createdAt, present: !!has && !has.hidden };
    }).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function importArchive(path) {
  const L = currentLibrary();
  const f = fsFile(path);
  if (!f?.snapshots) return { ok: false };
  const t = newTask(L, { type: 'snapshot-import', label: f.name, total: f.snapshots.length * 5, path });
  return { ok: true, taskId: t.id };
}
registerTaskType('snapshot-import', {
  lane: 'backup', firstStage: 'reading',
  step(t) {
    if (t.stage === 'reading') { t.stage = 'importing'; t.nextAt = Date.now() + 400; emit('tasks'); return; }
    t.processed++;
    if (t.processed < t.total) { t.nextAt = Date.now() + 140; emit('tasks'); return; }
    const L = t.lib, B = state(L);
    const known = (ids, has) => new Set(ids.filter(has));
    let added = 0, skipped = 0;
    for (const d of fsFile(t.path)?.snapshots ?? []) {
      const has = B.snapshots.find((s) => s.id === d.id);
      if (has && !has.hidden) { skipped++; continue; }
      added++;
      if (has) { has.hidden = false; continue; }
      const sets = d.files
        ? { files: known(d.files, (id) => !!fileOf(L, id)), groups: known(d.groups, (id) => !!groupOf(L, id)) }
        : asOf(L, d.createdAt);
      B.snapshots.push({ id: d.id, name: d.name, createdAt: d.createdAt, source: 'imported', hidden: false, ...sets });
    }
    B.snapshots.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    finish(t, 'done', { result: { added, skipped } });
    emit('snapshots');
  },
});

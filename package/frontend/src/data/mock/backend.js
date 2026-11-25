// The mock backend: everything the Go service will provide, simulated in memory.
// Methods return plain data (the API layer copies it and adds latency); changes are announced through onChange().
// access.js (sign-in, server mode, MCP keys, first run), snapshots.js (data backup) and indexing.js (the models, every
// file's index, indexing by itself) build on the pieces exported here.
import { artwork, paletteTone } from './art.js';
import { seedLibrary, buildFile, groupRecord, ago, isoOf } from './seed.js';
import { loadConfig, saveConfig, loadDbPrefs, saveDbPrefs, DEFAULT_DB_PATH } from './persist.js';
import { cleanIndexing } from '../domain/indexing.js';
import { mergeTags, tagLabel, tagKey, norm } from '../domain/tags.js';
import { findOnBoard, searchFiles, searchNames, splitTerms } from '../domain/search.js';
import { cleanBoard } from '../domain/board.js';
import { hashString } from '../domain/random.js';
import { kindOfExt } from '../domain/files.js';
import { keyCatalog } from '../domain/keys.js';
import { expandName, planTree, selectFiles } from '../domain/exportPlan.js';
import { uniqueName } from '../domain/filename.js';
import { arrange, cleanView } from '../domain/arrange.js';
import { autoCovers, MAX_COVERS } from '../domain/covers.js';

// ------------------------------------------------------------------ change feed
const listeners = new Set();
export const emit = (topic) => { for (const fn of listeners) fn(topic); };
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let libTimer = null;
const emitLibrarySoon = () => { if (!libTimer) libTimer = setTimeout(() => { libTimer = null; emit('library'); }, 600); };

// ------------------------------------------------------------------ for the modules built on this one
// (They import from here; this module never imports them back, so each hooks itself in as it loads.)
const openers = [];
/** Prepare each gallery as it is first opened (indexing.js: every file's index, the sample's index task). */
export const onLibraryOpen = (fn) => { openers.push(fn); };
const enders = [];
/** Hear of every task as it stops (indexing.js: uploaded files are indexed, a batch is counted once by the rules). */
export const onTaskEnd = (fn) => { enders.push(fn); };
/** The image index model files are indexed with now (null: none in use) — searching with words or a picture needs it. */
let imageIndexer = () => null;
export const setImageIndexer = (fn) => { imageIndexer = fn; };

// ------------------------------------------------------------------ config.toml
let config = loadConfig();
export const getConfig = () => config;
export function patchConfig(patch) { config = { ...config, ...patch }; saveConfig(config); }

// ------------------------------------------------------------------ galleries (one per database directory)
const libraries = new Map();
const nowIso = () => isoOf(new Date());

function emptyLibrary() {
  let f = 90000;
  return { groups: [], files: [], nextFileId: () => `f_${++f}`, specs: {} };
}

/**
 * What changed since the last snapshot and is not in one yet: the files and groups edited (with their values from
 * before), and whether page settings changed. New and removed things show up by comparing what exists.
 */
export const newEdits = () => ({ files: new Map(), groups: new Map(), prefs: false });

/**
 * Every change to a gallery gives it a new revision. A group's page asks for its files every few seconds with the
 * revision it already has, and an unchanged gallery answers with just that (the Go service keeps one per database).
 * One counter for every gallery, so switching database folders never repeats a revision.
 */
let REV = 0;
const touch = (L) => { L.rev = ++REV; };

function indexLibrary(L) {
  L.groupsById = new Map(L.groups.map((g) => [g.id, g]));
  L.filesById = new Map(L.files.map((f) => [f.id, f]));
  L.filesByGroup = new Map(L.groups.map((g) => [g.id, []]));
  for (const f of L.files) L.filesByGroup.get(f.groupId)?.push(f);
  L.docs = null;
  L.tags = null;
  touch(L);
}

function openLibrary(path) {
  let L = libraries.get(path);
  if (!L) {
    const seededLib = path === DEFAULT_DB_PATH;
    L = {
      path, seeded: seededLib, ...(seededLib ? seedLibrary() : emptyLibrary()), prefs: loadDbPrefs(path),
      edits: newEdits(),
      // groups and files that left the gallery but are still held by a snapshot
      vault: { groups: new Map(), files: new Map() },
    };
    indexLibrary(L);
    // the sample gallery remembers a picture you were looking at earlier today
    if (seededLib && !L.prefs.lastViewed) L.prefs.lastViewed = { fileId: L.filesByGroup.get('g_starry')?.[41]?.id, at: ago(0.09) };
    libraries.set(path, L);
    for (const fn of openers) fn(L);
    if (seededLib) seedTasks(L);
    warmIndexes(L);
  }
  return L;
}

/** Build the search and tag indexes while the page is idle (the Go service keeps its own, ready before it is asked). */
function warmIndexes(L) {
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
  idle(() => { searchDocs(L); tagIndexOf(L); }, { timeout: 2500 });
}
const lib = () => openLibrary(config.dbPath);
const savePrefs = (L) => { L.edits.prefs = true; saveDbPrefs(L.path, L.prefs); };
export { lib as currentLibrary, indexLibrary as reindex };
/** The gallery in use if it has been opened already (live values read before anything asked for it wait for it). */
export const openedLibrary = () => libraries.get(config.dbPath) ?? null;
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
/** What an edit can change, kept as it was before the first edit since the last snapshot (edits replace these values, never mutate them). */
export const GROUP_FIELDS = ['name', 'coverFileIds', 'configs', 'activeConfigId', 'fileOrder'];
/** hiddenTags: the tagger's tags the user took away (by key) — they stay away when the tagger looks again. */
export const FILE_FIELDS = ['userTags', 'hiddenTags', 'note', 'colors'];
const noteEdit = (map, item, fields) => { if (!map.has(item.id)) map.set(item.id, pick(item, fields)); };

// ------------------------------------------------------------------ views of the data
/** What the pages need to show a file (the picture itself comes from mediaUrl). */
export const fileRef = (f) => ({ id: f.id, kind: f.kind, name: f.name, ext: f.ext, width: f.width, height: f.height, duration: f.duration });
/** The tagger's tags of a file — none until the tagging model has looked at it (its index holds a tagging record). */
const taggerTags = (f) => (f.index?.tagging && !f.index.tagging.failed ? f.tags : []);
/** A file's tags as shown: the tagger's (less any the user took away) ∪ the user's own. */
const tagsOf = (f) => { const model = taggerTags(f); return mergeTags(f.hiddenTags?.length ? model.filter((t) => !f.hiddenTags.includes(tagKey(t.name))) : model, f.userTags); };
/** The colour a picture reads as from afar (the Go service keeps it from the import; the mock knows its paints). */
const toneOf = (f) => (f.art ? `#${paletteTone(f.art.palette).map((v) => v.toString(16).padStart(2, '0')).join('')}` : null);
const groupChip = (L, id) => { const g = L.groupsById.get(id); return g ? { id: g.id, name: g.name } : null; };

/** Groups in the user's order (set by dragging on the home page); ones never placed come first, newest first. */
export function orderedGroups(L) {
  const order = L.prefs.groupOrder;
  if (!order?.length) return L.groups;
  const at = new Map(order.map((id, i) => [id, i]));
  const placed = L.groups.filter((g) => at.has(g.id)).sort((a, b) => at.get(a.id) - at.get(b.id));
  const fresh = L.groups.filter((g) => !at.has(g.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...fresh, ...placed];
}

/**
 * A group's covers, main first (see domain/covers.js): the ones chosen, or Prism's own picks while none are —
 * also for a group kept only by a snapshot. → { files, auto }
 */
export function coversOf(L, g) {
  const live = L.groupsById.has(g.id);
  const files = live ? L.filesByGroup.get(g.id) ?? [] : [...L.vault.files.values()].filter((f) => f.groupId === g.id);
  const chosen = (g.coverFileIds ?? []).map((id) => (live ? L.filesById.get(id) : L.vault.files.get(id))).filter((f) => f?.groupId === g.id);
  return chosen.length ? { files: chosen, auto: false } : { files: autoCovers(files), auto: true };
}
/** The main cover. */
export const coverOf = (L, g) => coversOf(L, g).files[0] ?? null;

function groupCard(L, g) {
  const files = L.filesByGroup.get(g.id) ?? [];
  const covers = coversOf(L, g);
  const cfg = g.configs.find((c) => c.id === g.activeConfigId);
  return {
    id: g.id, name: g.name, createdAt: g.createdAt,
    updatedAt: files.reduce((m, f) => (f.importedAt > m ? f.importedAt : m), g.createdAt),
    fileCount: files.length,
    videoCount: files.filter((f) => f.kind === 'video').length,
    bytes: files.reduce((s, f) => s + f.size, 0),
    cover: covers.files[0] ? fileRef(covers.files[0]) : null,
    covers: covers.files.map(fileRef),
    coverAuto: covers.auto,
    palette: cfg ? { name: cfg.name, colors: cfg.groups.map((c) => ({ name: c.name, color: c.color })) } : null,
  };
}

// ------------------------------------------------------------------ media
/**
 * The address of a file's picture at a quality ('original' | 'high' | 'medium' | 'low'). For a video it is the
 * poster frame. The Go service serves these from the database directory; the mock paints them. Files kept only by a
 * snapshot still have their pictures.
 */
export function mediaUrl(ref, quality = 'original') {
  const L = lib();
  const f = L.filesById.get(ref?.id) ?? L.vault.files.get(ref?.id);
  if (!f) return null;
  if (f.upload) return f.kind === 'video' ? f.upload.poster : f.upload.url;
  return artwork(f.art.seed, f.art.style, f.art.palette, f.width, f.height);
}
/** The video itself. */
export function streamUrl(ref) {
  const f = lib().filesById.get(ref?.id);
  return f?.kind === 'video' ? (f.upload?.url ?? 'mock/loop.webm') : null;
}

// ------------------------------------------------------------------ home
export function getHome() {
  const L = lib();
  const last = L.prefs.lastViewed && L.filesById.get(L.prefs.lastViewed.fileId);
  // where it sits in its group, in the order the group's page shows (and its lightbox walks)
  const siblings = last ? arrange(pageData(L, L.groupsById.get(last.groupId)), getGroupView(last.groupId)).sequence : null;
  const week = ago(7);
  return {
    groups: orderedGroups(L).map((g) => groupCard(L, g)),
    view: getHomeView(),
    lastViewed: last ? { file: fileRef(last), group: groupChip(L, last.groupId), index: siblings.findIndex((f) => f.id === last.id), total: siblings.length, viewedAt: L.prefs.lastViewed.at } : null,
    stats: {
      groups: L.groups.length, files: L.files.length,
      bytes: L.files.reduce((s, f) => s + f.size, 0),
      thisWeek: L.files.filter((f) => f.importedAt >= week).length,
    },
  };
}

/** Home page settings: show covers at their own proportions (true) or all as squares. */
const DEFAULT_HOME_VIEW = { naturalRatio: true };
export function getHomeView() { return { ...DEFAULT_HOME_VIEW, ...lib().prefs.home }; }
export function saveHomeView(view) { const L = lib(); L.prefs.home = { ...getHomeView(), ...view }; savePrefs(L); }

export function setGroupOrder(ids) {
  const L = lib();
  L.prefs.groupOrder = ids.filter((id) => L.groupsById.has(id));
  savePrefs(L);
  emit('library');
  return { ok: true };
}

/** Every group, for pickers (search scopes, export, MCP keys, snapshots). */
export function listGroups() {
  const L = lib();
  return orderedGroups(L).map((g) => {
    const cover = coverOf(L, g);
    return { id: g.id, name: g.name, fileCount: L.filesByGroup.get(g.id)?.length ?? 0, cover: cover ? fileRef(cover) : null };
  });
}

/** Every colour group of every configuration, for the search scope picker. */
export function listColorGroups() {
  const L = lib();
  const count = new Map();
  for (const f of L.files) for (const id of Object.values(f.colors)) count.set(id, (count.get(id) ?? 0) + 1);
  return orderedGroups(L).flatMap((g) => g.configs.flatMap((c) => c.groups.map((x) => ({
    id: x.id, name: x.name, color: x.color, config: c.name, configId: c.id, group: { id: g.id, name: g.name }, fileCount: count.get(x.id) ?? 0,
  }))));
}

/** The pictures of a group its covers can be chosen from (newest first), and the covers Prism would pick itself. */
export function groupPictures(id, limit = 120) {
  const L = lib();
  const files = L.filesByGroup.get(id) ?? [];
  const pictures = files.filter((f) => f.kind === 'image').sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  return { pictures: pictures.slice(0, limit).map(fileRef), auto: autoCovers(files).map(fileRef) };
}

export function createGroup({ name }) {
  const L = lib();
  const clean = String(name ?? '').trim();
  if (!clean) return null;
  const g = { ...groupRecord({ key: `n${hashString(`${clean}|${Date.now()}`).toString(36)}`, name: clean, created: 0 }), createdAt: nowIso() };
  L.groups.push(g);
  indexLibrary(L);
  emit('library');
  return groupCard(L, g);
}

export function updateGroup(id, patch) {
  const L = lib();
  const g = L.groupsById.get(id);
  if (!g) return null;
  noteEdit(L.edits.groups, g, GROUP_FIELDS);
  if ('name' in patch) { const n = String(patch.name ?? '').trim(); if (!n) return null; g.name = n; }
  if ('coverFileIds' in patch) {
    // null or none: Prism picks them; otherwise pictures of this group, each once, the main one first
    const ids = [...new Set(patch.coverFileIds ?? [])].filter((fid) => { const f = L.filesById.get(fid); return f?.groupId === id && f.kind === 'image'; });
    g.coverFileIds = ids.slice(0, MAX_COVERS);
  }
  indexLibrary(L);
  emit('library');
  return groupCard(L, g);
}

/**
 * Deleting a group deletes the files in it (the Go service moves them to the system's recycle bin). Snapshots may
 * still hold them, so they move into the vault rather than vanishing.
 */
export function deleteGroup(id) {
  const L = lib();
  const g = L.groupsById.get(id);
  if (!g) return { ok: false };
  const gone = L.filesByGroup.get(id) ?? [];
  L.vault.groups.set(id, g);
  for (const f of gone) L.vault.files.set(f.id, f);
  L.groups = L.groups.filter((x) => x.id !== id);
  L.files = L.files.filter((f) => f.groupId !== id);
  if (L.prefs.groupOrder) L.prefs.groupOrder = L.prefs.groupOrder.filter((x) => x !== id);
  if (L.filesById.get(L.prefs.lastViewed?.fileId)?.groupId === id) L.prefs.lastViewed = null;
  savePrefs(L);
  indexLibrary(L);
  emit('library');
  return { ok: true, files: gone.length };
}

export function randomFile(excludeId) {
  const L = lib();
  const pool = L.files.filter((f) => f.id !== excludeId && f.kind === 'image');
  if (!pool.length) return null;
  const f = pool[Math.floor(Math.random() * pool.length)];
  return { file: fileRef(f), group: groupChip(L, f.groupId) };
}

/** A handful of pictures to riffle through while a random one is being drawn. */
export function sampleFiles(n = 8) {
  const L = lib();
  const pool = L.files.filter((f) => f.kind === 'image');
  return Array.from({ length: Math.min(n, pool.length) }, () => fileRef(pool[Math.floor(Math.random() * pool.length)]));
}

// ------------------------------------------------------------------ a group's page
/** What the page lists for each file (the rest comes with getFileDetail). colors: configuration → colour group. */
const fileRow = (f) => ({ ...fileRef(f), size: f.size, createdAt: f.createdAt, importedAt: f.importedAt, colors: f.colors, tone: toneOf(f) });
/** The pieces the browsing order is made from (domain/arrange.js). */
const pageData = (L, g) => ({ files: L.filesByGroup.get(g.id) ?? [], configs: g.configs, activeConfigId: g.activeConfigId, order: g.fileOrder ?? [] });

/**
 * Everything a group's page shows. `since`: the revision of the copy the page already has — an unchanged gallery
 * answers { rev, unchanged: true }, so asking every few seconds costs next to nothing.
 */
export function getGroupPage(id, since) {
  const L = lib();
  if (since != null && since === L.rev) return { rev: L.rev, unchanged: true };
  const g = L.groupsById.get(id);
  if (!g) return { rev: L.rev, group: null };
  return {
    rev: L.rev, group: groupCard(L, g),
    configs: g.configs, activeConfigId: g.activeConfigId, order: g.fileOrder ?? [],
    files: (L.filesByGroup.get(id) ?? []).map(fileRow),
    view: getGroupView(id),
    board: getBoard(id),
  };
}

/** A group's page settings (sort, sizes, layout…), each group its own. */
export const getGroupView = (id) => cleanView(lib().prefs.views?.[id]);
export function saveGroupView(id, view) {
  const L = lib();
  if (!L.groupsById.has(id)) return;
  L.prefs.views = { ...L.prefs.views, [id]: cleanView(view) };
  savePrefs(L);
  touch(L);                    // the page's next look brings the saved settings along
}

/** A group's whiteboard settings (where its colour groups were put by hand, its panels), each group its own. */
export const getBoard = (id) => cleanBoard(lib().prefs.boards?.[id]);
export function saveBoard(id, board) {
  const L = lib();
  if (!L.groupsById.has(id)) return;
  L.prefs.boards = { ...L.prefs.boards, [id]: cleanBoard(board) };
  savePrefs(L);
  touch(L);
}

/** The file being looked at, for the home page's "last viewed" (not a change a snapshot needs to keep). */
export function markViewed(fileId) {
  const L = lib();
  if (!L.filesById.has(fileId)) return;
  L.prefs.lastViewed = { fileId, at: nowIso() };
  saveDbPrefs(L.path, L.prefs);
  emit('viewed');
}

/** cover: where the file is among its group's covers — { index (0: the main cover), count, auto } — or null. */
export function getFileDetail(id) {
  const L = lib();
  const f = L.filesById.get(id);
  if (!f) return null;
  const g = L.groupsById.get(f.groupId);
  const cfg = g.configs.find((c) => c.id === g.activeConfigId) ?? null;
  const color = colorOf(g, f);
  const covers = coversOf(L, g);
  const at = covers.files.indexOf(f);
  return {
    file: fileRef(f), group: groupChip(L, f.groupId),
    config: cfg ? { id: cfg.id, name: cfg.name, colors: cfg.groups } : null,
    color: color ? { id: color.id, name: color.name, color: color.color } : null,
    size: f.size, createdAt: f.createdAt, importedAt: f.importedAt,
    tags: tagsOf(f).map((t) => ({ key: t.key, label: tagLabel(t.name), source: t.source, score: t.score ?? null })),
    note: f.note, comfy: f.comfy,
    cover: at < 0 ? null : { index: at, count: covers.files.length, auto: covers.auto },
  };
}

/** A file's colour group in the configuration its group uses (null: none). */
function setColor(L, f, colorId) {
  const g = L.groupsById.get(f.groupId);
  const cfg = g?.configs.find((c) => c.id === g.activeConfigId);
  if (!cfg) return;
  const next = { ...f.colors };
  if (colorId && cfg.groups.some((x) => x.id === colorId)) next[cfg.id] = colorId;
  else delete next[cfg.id];
  if (next[cfg.id] === f.colors[cfg.id]) return;
  noteEdit(L.edits.files, f, FILE_FIELDS);
  f.colors = next;
}

/**
 * patch: any of { userTags: [name], note, color: colour group id | null }. A tag the tagger already gave is not kept
 * twice; one of its tags the user had taken away and now adds again simply comes back.
 */
export function updateFile(id, patch) {
  const L = lib();
  const f = L.filesById.get(id);
  if (!f) return null;
  if ('userTags' in patch || 'note' in patch) noteEdit(L.edits.files, f, FILE_FIELDS);
  if ('userTags' in patch) {
    const hidden = new Set(f.hiddenTags ?? []);
    const seen = new Set(taggerTags(f).map((t) => tagKey(t.name)).filter((k) => !hidden.has(k)));
    const mine = [];
    for (const x of patch.userTags ?? []) {
      const v = String(x).trim().slice(0, 60), k = tagKey(v);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      if (hidden.has(k)) hidden.delete(k); else mine.push(v);
    }
    f.userTags = mine;
    f.hiddenTags = [...hidden];
  }
  if ('note' in patch) f.note = String(patch.note ?? '').slice(0, 4000);
  if ('color' in patch) setColor(L, f, patch.color);
  indexLibrary(L);
  emit('library');
  return getFileDetail(id);
}

// ------------------------------------------------------------------ several files at once (the whiteboard)
/**
 * What a batch of files carries: every tag any of them has, once — on how many and which of them, and whether the
 * tagger or the user gave it ('mixed': the tagger on some, the user on others) — and how their notes stand.
 */
export function filesSummary(ids) {
  const L = lib();
  const files = ids.map((id) => L.filesById.get(id)).filter(Boolean);
  const map = new Map();
  for (const f of files) {
    for (const t of tagsOf(f)) {
      let e = map.get(t.key);
      if (!e) map.set(t.key, (e = { key: t.key, label: tagLabel(t.name), ids: [], user: 0 }));
      e.ids.push(f.id);
      if (t.source === 'user') e.user++;
    }
  }
  const tags = [...map.values()]
    .map((e) => ({ key: e.key, label: e.label, count: e.ids.length, ids: e.ids, source: e.user === e.ids.length ? 'user' : e.user ? 'mixed' : 'model' }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const notes = new Set(files.map((f) => f.note ?? ''));
  const written = files.filter((f) => f.note).length;
  return { total: files.length, tags, notes: { written, distinct: [...notes].filter(Boolean).length, common: notes.size === 1 ? [...notes][0] : null } };
}

/**
 * Tags for many files at once. add: labels — a file that already shows the tag is left as it is (one of the tagger's
 * that the user took away comes back); remove: tags (keys or labels) — whoever gave it, it is gone from every file
 * that shows it (the tagger's stay away when it looks again). → { ok, changed: [the files that changed] }
 */
export function editFileTags(ids, { add = [], remove = [] } = {}) {
  const L = lib();
  const changed = [];
  for (const id of ids) {
    const f = L.filesById.get(id);
    if (!f) continue;
    const hidden = new Set(f.hiddenTags ?? []);
    const model = new Set(taggerTags(f).map((t) => tagKey(t.name)));
    const mine = [...f.userTags];
    let touched = false;
    for (const label of add) {
      const v = String(label ?? '').trim().slice(0, 60), k = tagKey(v);
      if (!k || (model.has(k) && !hidden.has(k)) || mine.some((x) => tagKey(x) === k)) continue;
      if (model.has(k)) hidden.delete(k); else mine.push(v);
      touched = true;
    }
    for (const key of remove) {
      const k = tagKey(key);
      const at = mine.findIndex((x) => tagKey(x) === k);
      if (at >= 0) { mine.splice(at, 1); touched = true; }
      if (model.has(k) && !hidden.has(k)) { hidden.add(k); touched = true; }
    }
    if (!touched) continue;
    noteEdit(L.edits.files, f, FILE_FIELDS);
    f.userTags = mine;
    f.hiddenTags = [...hidden];
    changed.push(f.id);
  }
  if (changed.length) { indexLibrary(L); emit('library'); }
  return { ok: true, changed };
}

/** Notes for many files: { fileId: note }, each replacing what was there. → { ok, previous: { fileId: the note it replaced } } */
export function setFileNotes(notes) {
  const L = lib();
  const previous = {};
  for (const [id, note] of Object.entries(notes ?? {})) {
    const f = L.filesById.get(id);
    const v = String(note ?? '').trim().slice(0, 4000);
    if (!f || f.note === v) continue;
    noteEdit(L.edits.files, f, FILE_FIELDS);
    previous[id] = f.note;
    f.note = v;
  }
  if (Object.keys(previous).length) { touch(L); emit('library'); }
  return { ok: true, previous };
}

/** Find on a group's whiteboard (see domain/search.js findOnBoard): in its files and the colour groups in use. */
export function findInGroup(groupId, text) {
  const L = lib();
  const g = L.groupsById.get(groupId);
  if (!g) return { files: [], colorGroups: [] };
  const docs = searchDocs(L).filter((d) => d.groupId === groupId);
  const names = new Map((L.filesByGroup.get(groupId) ?? []).map((f) => [f.id, `${f.name}.${f.ext}`]));
  return findOnBoard(docs, names, g.configs.find((c) => c.id === g.activeConfigId)?.groups ?? [], text);
}

/**
 * Arrange a group's files by hand: `order` is the new custom order (every file of the group, as the page shows them),
 * `colors` moves files into another colour group of the configuration in use ({ fileId: colour group id | null }).
 */
export function placeFiles(groupId, { order, colors }) {
  const L = lib();
  const g = L.groupsById.get(groupId);
  if (!g) return { ok: false };
  if (order) {
    noteEdit(L.edits.groups, g, GROUP_FIELDS);
    g.fileOrder = order.filter((id) => L.filesById.get(id)?.groupId === groupId);
  }
  for (const [id, colorId] of Object.entries(colors ?? {})) {
    const f = L.filesById.get(id);
    if (f?.groupId === groupId) setColor(L, f, colorId);
  }
  indexLibrary(L);
  emit('library');
  return { ok: true };
}

/**
 * Deleting files (the Go service moves them to the system's recycle bin). Snapshots may still hold them, so they move
 * into the vault; until then they can come back with restoreFiles (the "undo" right after deleting).
 */
export function deleteFiles(ids) {
  const L = lib();
  const gone = ids.map((id) => L.filesById.get(id)).filter(Boolean);
  if (!gone.length) return { ok: false, count: 0 };
  L.trash ??= new Map();
  for (const f of gone) {
    const g = L.groupsById.get(f.groupId);
    const cover = g?.coverFileIds.indexOf(f.id) ?? -1;          // a chosen cover leaves the covers (undo puts it back)
    if (cover >= 0) { noteEdit(L.edits.groups, g, GROUP_FIELDS); g.coverFileIds = g.coverFileIds.filter((x) => x !== f.id); }
    L.trash.set(f.id, { cover });
    L.vault.files.set(f.id, f);
  }
  const set = new Set(gone.map((f) => f.id));
  L.files = L.files.filter((f) => !set.has(f.id));
  indexLibrary(L);
  emit('library');
  return { ok: true, count: gone.length };
}
export function restoreFiles(ids) {
  const L = lib();
  const back = ids.map((id) => L.vault.files.get(id)).filter((f) => f && L.trash?.has(f.id) && L.groupsById.has(f.groupId));
  for (const f of back) {
    L.vault.files.delete(f.id);
    L.files.push(f);
    const g = L.groupsById.get(f.groupId);
    const { cover } = L.trash.get(f.id);
    if (cover >= 0 && !g.coverFileIds.includes(f.id) && g.coverFileIds.length < MAX_COVERS) g.coverFileIds = [...g.coverFileIds.slice(0, cover), f.id, ...g.coverFileIds.slice(cover)];
    L.trash.delete(f.id);
  }
  indexLibrary(L);
  emit('library');
  return { ok: true, count: back.length };
}

// ------------------------------------------------------------------ colour groups
/** A group's colour-group configurations, and how many of its files each colour group holds. */
export function getColorConfigs(groupId) {
  const L = lib();
  const g = L.groupsById.get(groupId);
  if (!g) return null;
  const files = L.filesByGroup.get(groupId) ?? [];
  const counts = {};
  for (const f of files) for (const id of Object.values(f.colors)) counts[id] = (counts[id] ?? 0) + 1;
  return { configs: g.configs, activeConfigId: g.activeConfigId, counts, total: files.length };
}

let uidSeq = 0;
const uid = (prefix) => `${prefix}${Date.now().toString(36).slice(-5)}${(++uidSeq).toString(36)}`;
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Save every configuration of a group and put one to use. New configurations and colour groups arrive with ids that
 * start with 'new:'; whatever is left out is removed, and its files leave it.
 */
export function saveColorConfigs(groupId, { configs, activeConfigId }) {
  const L = lib();
  const g = L.groupsById.get(groupId);
  if (!g) return null;
  noteEdit(L.edits.groups, g, GROUP_FIELDS);
  const ids = new Map();
  const next = (configs ?? []).map((c) => {
    const old = g.configs.find((x) => x.id === c.id);
    const cid = old ? old.id : uid(`${g.id}_c`);
    ids.set(c.id, cid);
    return {
      id: cid,
      name: String(c.name ?? '').trim().slice(0, 40) || '—',
      groups: (c.groups ?? []).map((x) => ({
        id: old?.groups.some((y) => y.id === x.id) ? x.id : uid(`${cid}_`),
        name: String(x.name ?? '').trim().slice(0, 40) || '—',
        color: HEX.test(x.color) ? x.color.toLowerCase() : '#8893a5',
      })),
    };
  });
  const alive = new Map(next.map((c) => [c.id, new Set(c.groups.map((x) => x.id))]));
  for (const f of L.filesByGroup.get(groupId) ?? []) {
    const stale = Object.entries(f.colors).filter(([cfg, id]) => !alive.get(cfg)?.has(id));
    if (!stale.length) continue;
    noteEdit(L.edits.files, f, FILE_FIELDS);
    const colors = { ...f.colors };
    for (const [cfg] of stale) delete colors[cfg];
    f.colors = colors;
  }
  g.configs = next;
  g.activeConfigId = ids.get(activeConfigId) ?? null;
  indexLibrary(L);
  emit('library');
  return getColorConfigs(groupId);
}

/** The order of a configuration's colour groups (dragged on the page or in the colour-group dialog). */
export function reorderColorGroups(groupId, configId, order) {
  const L = lib();
  const g = L.groupsById.get(groupId);
  if (!g?.configs.some((c) => c.id === configId)) return { ok: false };
  noteEdit(L.edits.groups, g, GROUP_FIELDS);
  const at = new Map(order.map((id, i) => [id, i]));
  g.configs = g.configs.map((c) => (c.id !== configId ? c : { ...c, groups: [...c.groups].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9)) }));
  touch(L);
  emit('library');
  return { ok: true };
}

/** A configuration of a group and the group itself, or nothing. */
function configOf(L, groupId, configId) {
  const g = L.groupsById.get(groupId);
  const cfg = g?.configs.find((c) => c.id === configId);
  return cfg ? { g, cfg } : null;
}
/** The group's configurations with one of them changed (configurations are replaced, never changed in place). */
const withConfig = (g, configId, fn) => g.configs.map((c) => (c.id === configId ? fn(c) : c));

/** One colour group's name and colour (edited on the whiteboard). patch: any of { name, color } → { ok, colorGroup } */
export function updateColorGroup(groupId, configId, colorId, patch) {
  const L = lib();
  const at = configOf(L, groupId, configId);
  const x = at?.cfg.groups.find((c) => c.id === colorId);
  if (!x) return { ok: false };
  const next = { ...x };
  if ('name' in patch) { const n = String(patch.name ?? '').trim().slice(0, 40); if (n) next.name = n; }
  if ('color' in patch && HEX.test(patch.color ?? '')) next.color = patch.color.toLowerCase();
  if (next.name === x.name && next.color === x.color) return { ok: true, colorGroup: x };
  noteEdit(L.edits.groups, at.g, GROUP_FIELDS);
  at.g.configs = withConfig(at.g, configId, (c) => ({ ...c, groups: c.groups.map((y) => (y.id === colorId ? next : y)) }));
  touch(L);
  emit('library');
  return { ok: true, colorGroup: next };
}

/**
 * A new colour group in a configuration (at `index`, else last), with `fileIds` of the group moved into it.
 * input: { name, color, index } → { ok, colorGroup: { id, name, color } }
 */
export function createColorGroup(groupId, configId, input = {}, fileIds = []) {
  const L = lib();
  const at = configOf(L, groupId, configId);
  if (!at) return { ok: false };
  const x = {
    id: uid(`${configId}_`),
    name: String(input.name ?? '').trim().slice(0, 40) || '—',
    color: HEX.test(input.color ?? '') ? input.color.toLowerCase() : '#8893a5',
  };
  noteEdit(L.edits.groups, at.g, GROUP_FIELDS);
  at.g.configs = withConfig(at.g, configId, (c) => {
    const groups = [...c.groups];
    groups.splice(Number.isInteger(input.index) ? Math.max(0, Math.min(groups.length, input.index)) : groups.length, 0, x);
    return { ...c, groups };
  });
  for (const id of fileIds) {
    const f = L.filesById.get(id);
    if (f?.groupId !== groupId || f.colors[configId] === x.id) continue;
    noteEdit(L.edits.files, f, FILE_FIELDS);
    f.colors = { ...f.colors, [configId]: x.id };
  }
  indexLibrary(L);
  emit('library');
  return { ok: true, colorGroup: x };
}

/** A colour group removed; its files belong to no colour group (of that configuration) afterwards. → { ok, colorGroup, index, files: [ids] } */
export function removeColorGroup(groupId, configId, colorId) {
  const L = lib();
  const at = configOf(L, groupId, configId);
  const index = at?.cfg.groups.findIndex((c) => c.id === colorId) ?? -1;
  if (index < 0) return { ok: false };
  const x = at.cfg.groups[index];
  noteEdit(L.edits.groups, at.g, GROUP_FIELDS);
  at.g.configs = withConfig(at.g, configId, (c) => ({ ...c, groups: c.groups.filter((y) => y.id !== colorId) }));
  const files = [];
  for (const f of L.filesByGroup.get(groupId) ?? []) {
    if (f.colors[configId] !== colorId) continue;
    noteEdit(L.edits.files, f, FILE_FIELDS);
    const colors = { ...f.colors };
    delete colors[configId];
    f.colors = colors;
    files.push(f.id);
  }
  indexLibrary(L);
  emit('library');
  return { ok: true, colorGroup: x, index, files };
}

/** Which configuration a group's files are gathered by (null: none). */
export function setActiveConfig(groupId, configId) {
  const L = lib();
  const g = L.groupsById.get(groupId);
  if (!g) return { ok: false };
  noteEdit(L.edits.groups, g, GROUP_FIELDS);
  g.activeConfigId = g.configs.some((c) => c.id === configId) ? configId : null;
  touch(L);
  emit('library');
  return { ok: true };
}

// ------------------------------------------------------------------ downloading, uploading (re-indexing: indexing.js)
/**
 * Files named with the download pattern from Settings. One file comes back to be saved at once
 * ({ file: { url, name, ext, kind, width, height } }); several are packed into one download by a task.
 */
export function downloadFiles(ids) {
  const L = lib();
  const files = ids.map((id) => L.filesById.get(id)).filter(Boolean);
  if (!files.length) return { ok: false };
  const template = config.downloadName ?? DEFAULT_DOWNLOAD_NAME;
  const now = new Date(), taken = new Set(), width = Math.max(3, String(files.length).length);
  const names = files.map((f, i) => uniqueName(expandName(template, { ...entryOf(L, f), lang: config.language, now, seq: i + 1, width }).base, f.ext, taken));
  if (files.length === 1) {
    const f = files[0];
    return { ok: true, file: { url: f.kind === 'video' ? streamUrl(f) : mediaUrl(f, 'original'), name: names[0], ext: f.ext, kind: f.kind, width: f.width, height: f.height } };
  }
  const groupIds = [...new Set(files.map((f) => f.groupId))];
  const t = newTask(L, { type: 'download', groupId: groupIds.length === 1 ? groupIds[0] : undefined, groupIds, total: files.length, result: { files: files.length } });
  return { ok: true, taskId: t.id, count: files.length };
}

/** Pictures and videos from this computer join the group one by one. entries: what files.js `probe` read from them. */
export function uploadFiles(groupId, entries) {
  const L = lib();
  if (!L.groupsById.has(groupId) || !entries.length) return { ok: false };
  const t = newTask(L, { type: 'upload', groupId, total: entries.length, uploads: entries });
  return { ok: true, taskId: t.id };
}
function uploadedFile(L, g, u) {
  return {
    id: L.nextFileId(), groupId: g.id, name: u.name, ext: u.ext, kind: u.kind, width: u.width, height: u.height, size: u.size, duration: u.duration,
    createdAt: isoOf(new Date(u.createdAt)), importedAt: nowIso(), art: null, tags: [], userTags: [], note: '', comfy: null, colors: {},
    index: {}, upload: { url: u.url, poster: u.poster },
  };
}

// ------------------------------------------------------------------ search
/**
 * Text → pictures and picture → pictures need the image index: an image index model in use, and pictures indexed with
 * it (the sample starts with one only with `?image-search` in the address — or once one is downloaded and built).
 */
export function searchCapabilities() {
  const ready = !!imageIndexer() && searchDocs(lib()).some((d) => d.embedded);
  return {
    semantic: { available: ready, reason: ready ? null : 'noIndex' },
    similar: { available: ready, reason: ready ? null : 'noIndex' },
  };
}

/** (Rebuilt lazily after `L.docs = null`: indexing.js drops it as tags and the image index change.) */
function searchDocs(L) {
  if (L.docs) return L.docs;
  const by = imageIndexer();
  L.docs = L.files.map((f) => {
    const positive = f.comfy?.positive ?? '', negative = f.comfy?.negative ?? '';
    return {
      id: f.id, groupId: f.groupId, colorIds: new Set(Object.values(f.colors)), importedAt: f.importedAt, art: f.art,
      embedded: !!by && f.index?.embedding?.by === by,
      tags: tagsOf(f).map((t) => ({ key: t.key, label: tagLabel(t.name), source: t.source })),
      positive, negative, nPositive: norm(positive), nNegative: norm(negative),
    };
  });
  return L.docs;
}

// The mock's "image index": words map to what is drawn (styles) and to the colours (palettes).
const CONCEPTS = [
  { words: ['night', 'dark', 'star', 'moon', '夜', '星', '月'], styles: ['moonlit', 'town', 'aurora'], palettes: ['night', 'deep'] },
  { words: ['sea', 'ocean', 'beach', 'water', 'wave', '海', '水', '浪'], styles: ['sea', 'waves'] },
  { words: ['girl', 'woman', 'character', 'person', 'portrait', '女', '人', '角色', '立绘'], styles: ['portrait'] },
  { words: ['cat', 'kitten', 'pet', '猫'], styles: ['cat'] },
  { words: ['flower', 'plant', 'leaf', 'garden', '花', '植物', '叶'], styles: ['botanic', 'stilllife'] },
  { words: ['mountain', 'hill', 'landscape', 'field', '山', '风景', '原野'], styles: ['hills', 'pixel', 'aurora'] },
  { words: ['city', 'town', 'street', 'building', '城', '街', '楼', '建筑'], styles: ['town', 'bokeh'] },
  { words: ['snow', 'winter', 'aurora', 'cold', '雪', '冬', '极光'], styles: ['aurora'] },
  { words: ['pattern', 'geometric', 'abstract', 'shape', '几何', '图案', '抽象'], styles: ['bauhaus', 'waves'] },
  { words: ['pixel', 'retro', '像素'], styles: ['pixel'] },
  { words: ['still life', 'cup', 'vase', 'table', '静物', '杯', '花瓶'], styles: ['stilllife'] },
  { words: ['light', 'bokeh', 'blur', 'glow', '光', '散景'], styles: ['bokeh'] },
  { words: ['pink', 'sakura', 'cherry', '粉', '樱'], palettes: ['sakura', 'dusk'] },
  { words: ['blue', '蓝'], palettes: ['lagoon', 'night', 'deep'] },
  { words: ['green', '绿'], palettes: ['forest', 'mint', 'sage'] },
  { words: ['purple', 'violet', '紫'], palettes: ['lavender', 'dusk'] },
  { words: ['warm', 'orange', 'sunset', 'dusk', 'evening', '暖', '橙', '黄昏', '夕'], palettes: ['amber', 'peach', 'dawn', 'dusk'] },
];
function semanticRank(docs, text) {
  const q = norm(text);
  const hit = CONCEPTS.filter((c) => c.words.some((w) => q.includes(w)));
  if (!hit.length) return new Map();
  const styles = new Set(hit.flatMap((c) => c.styles ?? [])), palettes = new Set(hit.flatMap((c) => c.palettes ?? []));
  const out = new Map();
  for (const d of docs) {
    if (!d.art || !d.embedded) continue;                    // not in the image index (yet), or uploaded here: the mock can't see it
    const s = (styles.size ? (styles.has(d.art.style) ? 0.62 : 0) : 0.3) + (palettes.size ? (palettes.has(d.art.palette) ? 0.3 : 0) : 0.2);
    const sim = s + (hashString(`${d.id}|${q}`) % 80) / 1000;
    if (sim >= 0.6) out.set(d.id, Math.min(0.99, sim));
  }
  return out;
}

/** Query pictures handed in for "similar pictures", by token: the colour they read as (and the file, if it is one of ours). */
const queries = new Map();
export function registerQueryImage({ tone, fileId }) {
  const token = `q_${hashString(`${tone}|${fileId}|${Date.now()}`).toString(36)}`;
  queries.set(token, { tone, fileId });
  return token;
}
function similarRank(docs, L, token) {
  const q = queries.get(token);
  if (!q) return new Map();
  const src = q.fileId ? L.filesById.get(q.fileId) : null;
  const tone = src?.art ? paletteTone(src.art.palette) : q.tone;
  if (!tone) return new Map();
  const scored = [];
  for (const d of docs) {
    if (d.id === q.fileId || !d.art || !d.embedded) continue;
    const t = paletteTone(d.art.palette);
    const dist = Math.hypot(t[0] - tone[0], t[1] - tone[1], t[2] - tone[2]) / 441;
    scored.push([d.id, Math.min(0.99, (1 - dist) * 0.8 + (src && src.art.style === d.art.style ? 0.18 : 0) + (hashString(`${d.id}|${token}`) % 40) / 1000)]);
  }
  // the closest pictures, as long as they are still alike
  return new Map(scored.sort((a, b) => b[1] - a[1]).slice(0, 90).filter(([, sim]) => sim >= 0.55));
}

/**
 * text: the words; domains: see domain/search.js; image: a query token from registerQueryImage (for `similar`).
 * → { groups, colorGroups, files: [{ file, group, matched, tag, prompt, similarity }], total }
 */
export function search({ text = '', domains, image }) {
  const L = lib();
  const caps = searchCapabilities();
  const docs = searchDocs(L);
  const ranked = {
    semantic: domains.semantic && caps.semantic.available && text.trim() ? semanticRank(docs, text) : null,
    similar: domains.similar && caps.similar.available && image ? similarRank(docs, L, image) : null,
  };
  const res = searchFiles(docs, text, domains, ranked);
  return {
    total: res.total,
    terms: splitTerms(text),
    groups: searchNames(listGroups(), text, 6),
    colorGroups: searchNames(listColorGroups(), text, 8),
    files: res.files.map((h) => ({ ...h, file: fileRef(L.filesById.get(h.fileId)), group: groupChip(L, L.filesById.get(h.fileId).groupId) })),
  };
}

// ------------------------------------------------------------------ tags
function tagIndexOf(L) {
  if (!L.tags) {
    const map = new Map();
    for (const f of L.files) {
      for (const t of tagsOf(f)) {
        let e = map.get(t.key);
        if (!e) map.set(t.key, (e = { key: t.key, label: tagLabel(t.name), count: 0, user: 0 }));
        e.count++;
        if (t.source === 'user') e.user++;
      }
    }
    L.tags = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  return L.tags;
}
/** Every tag in the gallery, once: how many files carry it, and how many of those the user tagged by hand. */
export function getTagIndex() {
  const L = lib();
  return { tags: tagIndexOf(L).map((t) => ({ ...t, source: t.user === t.count ? 'user' : 'model' })), files: L.files.length };
}

/** A few files carrying a tag (newest first), to show what it looks like. */
export function tagSamples(key, n = 6) {
  const L = lib();
  const k = tagKey(key);
  return L.files
    .filter((f) => tagsOf(f).some((t) => t.key === k))
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, n)
    .map((f) => ({ file: fileRef(f), group: groupChip(L, f.groupId) }));
}

// ------------------------------------------------------------------ tasks
// Background work runs one task at a time per lane. The gallery's own work (imports, re-indexing), copying files out
// (exports, downloads), the tagging model and snapshots each have their own lane, so a long re-index never holds up
// a snapshot or a download.
const tasks = [];
let taskSeq = 100;
let ticker = null;
const RUNNERS = {};

/** A kind of task: { lane, firstStage, step(task) — runs whenever task.nextAt has passed —, end?(task) — once it stops }. */
export function registerTaskType(type, runner) { RUNNERS[type] = runner; }

export function newTask(L, t) {
  const task = { id: `t_${++taskSeq}`, lib: L, state: 'queued', stage: 'queued', processed: 0, total: 0, createdAt: nowIso(), ...t };
  tasks.push(task);
  emit('tasks');
  if (!ticker) ticker = setInterval(tick, 120);
  return task;
}
export function finish(t, state, extra = {}) {
  Object.assign(t, { state, stage: state, finishedAt: nowIso() }, extra);
  RUNNERS[t.type]?.end?.(t);
  for (const fn of enders) fn(t);
  emit('tasks'); emit('library');
}
/** Tasks still to do (or doing), for parts of the mock that show their own progress. */
export const activeTasks = () => tasks.filter((x) => x.state === 'running' || x.state === 'queued');

function tick() {
  for (const lane of new Set(Object.values(RUNNERS).map((r) => r.lane))) {
    const inLane = (x) => RUNNERS[x.type]?.lane === lane;
    const t = tasks.find((x) => x.state === 'running' && inLane(x));
    if (t) { if (Date.now() >= t.nextAt) RUNNERS[t.type].step(t); continue; }
    const next = tasks.find((x) => x.state === 'queued' && inLane(x));
    if (next) {
      Object.assign(next, { state: 'running', stage: RUNNERS[next.type].firstStage, startedAt: nowIso(), nextAt: Date.now() + 900 });
      emit('tasks');
    }
  }
  if (!activeTasks().length) { clearInterval(ticker); ticker = null; }
}
const later = (t, ms) => { t.nextAt = Date.now() + ms; emit('tasks'); };

registerTaskType('import', {
  lane: 'library', firstStage: 'preparing',
  step(t) {
    if (t.stage === 'preparing') { t.stage = 'importing'; later(t, 300); return; }
    // each imported file joins its group as it arrives (not indexed yet)
    const L = t.lib, g = L.groupsById.get(t.groupId), spec = L.specs[t.groupId];
    if (g && spec) {
      const f = buildFile(spec, g, spec.count + t.processed + 1, L.nextFileId(), false);
      Object.assign(f, { createdAt: ago(0.02), importedAt: nowIso(), index: {} });
      L.files.push(f);
      indexLibrary(L);
      emitLibrarySoon();
    }
    t.processed++;
    if (t.processed >= t.total) finish(t, 'done', { result: { files: t.total } });
    else later(t, 420);
  },
});
/** Copying files out: a share of the work per step. */
const copying = (first, working, pace) => ({
  lane: 'files', firstStage: first,
  step(t) {
    if (t.stage === first && first !== working) { t.stage = working; later(t, 300); return; }
    t.processed = Math.min(t.total, t.processed + Math.max(1, Math.ceil(t.total / 60)));
    if (t.processed >= t.total) finish(t, 'done', { result: t.result });
    else later(t, pace);
  },
});
registerTaskType('export', copying('preparing', 'copying', 90));
registerTaskType('download', copying('packing', 'packing', 110));
/** Files sent from this computer: a lane of their own, so they never wait behind a long re-index. */
registerTaskType('upload', {
  lane: 'upload', firstStage: 'uploading',
  step(t) {
    const L = t.lib, g = L.groupsById.get(t.groupId);
    if (!g) { finish(t, 'failed', { error: { code: 'groupMissing' } }); return; }
    const f = uploadedFile(L, g, t.uploads[t.processed]);
    L.files.push(f);
    (t.created ??= []).push(f.id);
    indexLibrary(L);
    emitLibrarySoon();
    t.processed++;
    if (t.processed >= t.total) finish(t, 'done', { result: { files: t.total } });
    else later(t, 240);
  },
});

function taskView(t) {
  const L = t.lib;
  const ids = t.groupIds ?? (t.groupId ? [t.groupId] : []);
  return {
    id: t.id, type: t.type, state: t.state, stage: t.stage, processed: t.processed, total: t.total, unit: t.unit ?? 'files',
    createdAt: t.createdAt, startedAt: t.startedAt ?? null, finishedAt: t.finishedAt ?? null,
    kinds: t.kinds ?? null, label: t.label ?? null, origin: t.origin ?? null,
    group: t.groupId ? groupChip(L, t.groupId) ?? { id: t.groupId, name: t.groupName } : null,
    groups: ids.map((id) => groupChip(L, id)).filter(Boolean),
    result: t.result ?? null, error: t.error ?? null,
  };
}
export const getTasks = () => tasks.map(taskView);
export function clearTaskHistory() {
  for (let i = tasks.length - 1; i >= 0; i--) if (['done', 'failed', 'canceled'].includes(tasks[i].state)) tasks.splice(i, 1);
  emit('tasks');
}
export function cancelTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (t && (t.state === 'queued' || t.state === 'running')) finish(t, 'canceled');
}

function seedTasks(L) {
  const past = (type, d, extra) => tasks.push({
    id: `t_${++taskSeq}`, lib: L, type, createdAt: ago(d + 0.02), startedAt: ago(d + 0.018), finishedAt: ago(d), processed: extra.total, ...extra,
  });
  const size = (gid) => (L.filesByGroup.get(gid) ?? []).reduce((s, f) => s + f.size, 0);
  past('model-download', 5.2, { state: 'done', stage: 'done', total: 1_265_000_000, unit: 'bytes', label: 'EVA02-Large v3', result: { bytes: 1_265_000_000 } });
  past('reindex', 5.4, { state: 'failed', stage: 'failed', groupId: 'g_land', kinds: ['tagging'], total: 486, processed: 0, error: { code: 'modelMissing' } });
  past('export', 3.1, { state: 'done', stage: 'done', groupId: 'g_kotori', total: 128, result: { files: 128, bytes: size('g_kotori'), dir: 'D:\\Exports\\Prism' } });
  past('download', 1.8, { state: 'canceled', stage: 'canceled', groupId: 'g_wall', total: 94, processed: 41 });
  past('import', 1.1, { state: 'done', stage: 'done', groupId: 'g_winter', total: 64, result: { files: 64 } });
  // (in flight before these: the night sky being re-tagged — indexing.js); a batch for the inbox waits behind it
  newTask(L, { type: 'import', groupId: 'g_inbox', total: 24 });
}

// ------------------------------------------------------------------ export
/** A file's colour group: the one it belongs to in its group's active configuration. */
function colorOf(g, f) {
  const cfg = g.configs.find((c) => c.id === g.activeConfigId);
  return cfg?.groups.find((x) => x.id === f.colors[cfg.id]) ?? null;
}
const entryOf = (L, f) => { const g = L.groupsById.get(f.groupId); return { file: f, group: g, color: colorOf(g, f) }; };
const exportEntries = (L) => orderedGroups(L).flatMap((g) => (L.filesByGroup.get(g.id) ?? []).map((f) => ({ file: f, group: g, color: colorOf(g, f) })));

/**
 * What the export sheet offers. File types come from the chosen groups (from a group's page) or from the whole
 * gallery (from the home page); the calendar marks how many files of the chosen groups were imported each day.
 */
export function getExportOptions({ scope, groupIds }) {
  const L = lib();
  const chosen = (groupIds ?? []).filter((id) => L.groupsById.has(id));
  const typeScope = scope === 'home' ? L.groups.map((g) => g.id) : chosen;
  const counts = new Map();
  for (const id of typeScope) for (const f of L.filesByGroup.get(id) ?? []) counts.set(f.ext, (counts.get(f.ext) ?? 0) + 1);
  const calendar = {};
  for (const id of chosen.length ? chosen : L.groups.map((g) => g.id)) {
    for (const f of L.filesByGroup.get(id) ?? []) { const d = f.importedAt.slice(0, 10); calendar[d] = (calendar[d] ?? 0) + 1; }
  }
  return {
    groups: listGroups(),
    fileTypes: [...counts].sort((a, b) => b[1] - a[1]).map(([ext, count]) => ({ ext, count, kind: kindOfExt(ext) })),
    keys: keyCatalog(config.language),
    calendar,
  };
}
export const getKeyCatalog = () => keyCatalog(config.language);

function planFor(L, cfg, maxPerDir) {
  const entries = selectFiles(exportEntries(L), cfg);
  return planTree(entries, { template: cfg.template, lang: config.language, now: new Date(), maxPerDir, rootName: cfg.outputDir || '…' });
}
export function previewExport(cfg, { maxPerDir = 5 } = {}) { return planFor(lib(), cfg, maxPerDir); }
export function startExport(cfg) {
  const L = lib();
  const plan = planFor(L, cfg, 0);
  const t = newTask(L, { type: 'export', groupIds: cfg.groupIds, total: plan.files, result: { files: plan.files, bytes: plan.bytes, dir: cfg.outputDir } });
  return { taskId: t.id, files: plan.files };
}
export function getLastExportConfig(scope) { return lib().prefs.exports?.[scope] ?? null; }
export function saveLastExportConfig(scope, cfg) { const L = lib(); L.prefs.exports = { ...L.prefs.exports, [scope]: cfg }; savePrefs(L); emit('exports'); }

/**
 * How downloaded files would be named with a template: a few real files of different kinds, named in one batch
 * (so names that come out the same are numbered, as they would be on disk).
 */
export function namePreview(template) {
  const L = lib();
  const picks = [
    L.files.find((f) => f.comfy), L.files.find((f) => !f.comfy && f.kind === 'image' && f.groupId !== 'g_inbox'), L.files.find((f) => f.kind === 'video'),
  ].filter(Boolean);
  const now = new Date(), taken = new Set();
  return (picks.length ? picks : L.files.slice(0, 3)).map((f, i) => {
    const { base } = expandName(template, { ...entryOf(L, f), lang: config.language, now, seq: i + 1, width: 3 });
    return { file: fileRef(f), original: `${f.name}.${f.ext}`, name: uniqueName(base, f.ext, taken) };
  });
}

// ------------------------------------------------------------------ file system (folder browsing for pickers)
// The Go service lists real directories; the mock keeps a small believable tree in memory.
const FS = {
  'C:\\': ['Program Files', 'Users'],
  'C:\\Program Files': ['Prism'], 'C:\\Program Files\\Prism': ['data'], 'C:\\Program Files\\Prism\\data': [],
  'C:\\Users': ['Mio'],
  'C:\\Users\\Mio': ['Desktop', 'Documents', 'Downloads', 'Pictures'],
  'C:\\Users\\Mio\\Desktop': [], 'C:\\Users\\Mio\\Documents': ['Prism'], 'C:\\Users\\Mio\\Documents\\Prism': [],
  'C:\\Users\\Mio\\Downloads': [], 'C:\\Users\\Mio\\Pictures': ['Screenshots', 'Wallpapers'],
  'C:\\Users\\Mio\\Pictures\\Screenshots': [], 'C:\\Users\\Mio\\Pictures\\Wallpapers': [],
  'D:\\': ['ComfyUI', 'Exports', 'Prism'],
  'D:\\ComfyUI': ['input', 'output'], 'D:\\ComfyUI\\input': [], 'D:\\ComfyUI\\output': [],
  'D:\\Exports': ['Prism', 'Old'], 'D:\\Exports\\Prism': [], 'D:\\Exports\\Old': [],
  'D:\\Prism': ['backup', 'data', 'models'], 'D:\\Prism\\data': [], 'D:\\Prism\\backup': [], 'D:\\Prism\\models': [],
  'E:\\': ['Archive', 'Illustrations'],
  'E:\\Archive': ['Prism', '2025'], 'E:\\Archive\\Prism': [], 'E:\\Archive\\2025': [],
  'E:\\Illustrations': ['References'], 'E:\\Illustrations\\References': [],
};
/** Files the pickers can choose (snapshot archives); folder → [{ name, size, modifiedAt, ...payload }]. */
const FILES = {};
const parentOf = (path) => { const i = path.replace(/\\$/, '').lastIndexOf('\\'); return i < 0 ? null : i === 2 ? path.slice(0, 3) : path.slice(0, i); };
const joinPath = (dir, name) => (dir.endsWith('\\') ? dir + name : `${dir}\\${name}`);

/** Place a file in the mock disk; a taken name gets " (2)", " (3)"… like Explorer does. Returns its full path. */
export function fsAddFile(dir, file) {
  const list = FILES[dir] ?? (FILES[dir] = []);
  const dot = file.name.lastIndexOf('.');
  let name = file.name;
  for (let n = 2; list.some((f) => f.name === name); n++) name = `${file.name.slice(0, dot)} (${n})${file.name.slice(dot)}`;
  list.push({ ...file, name });
  return joinPath(dir, name);
}
export function fsFile(path) {
  const name = path.slice(path.lastIndexOf('\\') + 1);
  return FILES[parentOf(path)]?.find((f) => f.name === name) ?? null;
}

/** Drives and the current user's common folders. */
export function fsRoots() {
  return {
    drives: Object.keys(FS).filter((p) => p.length === 3).map((p) => ({ name: p.slice(0, 2), path: p })),
    places: [
      { id: 'desktop', path: 'C:\\Users\\Mio\\Desktop' }, { id: 'documents', path: 'C:\\Users\\Mio\\Documents' },
      { id: 'downloads', path: 'C:\\Users\\Mio\\Downloads' }, { id: 'pictures', path: 'C:\\Users\\Mio\\Pictures' },
    ],
  };
}
/**
 * Sub-folders of a folder; `library` marks folders that already hold a Prism database.
 * With `accept` (extensions), the files of those types are listed too.
 */
export function fsList(path, { accept } = {}) {
  let dir = String(path ?? '').trim().replace(/\//g, '\\');
  if (/^[a-z]:\\?$/i.test(dir)) dir = `${dir.slice(0, 2).toUpperCase()}\\`;
  else dir = dir.replace(/\\+$/, '');
  if (dir) dir = dir[0].toUpperCase() + dir.slice(1);
  const children = FS[dir];
  if (!children) return { ok: false, path: dir };
  const ext = (n) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
  return {
    ok: true, path: dir, parent: parentOf(dir),
    entries: [...children].sort((a, b) => a.localeCompare(b)).map((name) => {
      const full = joinPath(dir, name);
      return { name, path: full, library: libraries.has(full) || full === DEFAULT_DB_PATH };
    }),
    files: accept ? (FILES[dir] ?? []).filter((f) => accept.includes(ext(f.name)))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
      .map((f) => ({ name: f.name, path: joinPath(dir, f.name), size: f.size, modifiedAt: f.modifiedAt })) : [],
  };
}
export function fsCreateFolder(dir, name) {
  const clean = name.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!clean || !FS[dir] || FS[dir].includes(clean)) return { ok: false };
  FS[dir].push(clean);
  FS[joinPath(dir, clean)] = [];
  return { ok: true, path: joinPath(dir, clean) };
}

// ------------------------------------------------------------------ settings (config.toml)
// Password, server mode and MCP have their own endpoints (access.js); the models have theirs (indexing.js).
const SETTINGS = ['language', 'theme', 'dbPath', 'conflict', 'gpu', 'whiteboard', 'downloadName', 'indexing'];
const CHOICES = { language: ['en', 'zh-CN'], theme: ['light', 'dark'], conflict: ['keep', 'skip', 'overwrite'], whiteboard: ['auto', 'webgl', 'dom'] };
/** Downloads keep each file's own name unless the user sets a pattern. */
const DEFAULT_DOWNLOAD_NAME = [{ type: 'key', kind: 'data', id: 'file.name' }];

/** indexing: indexing as files are uploaded, and automatic indexing — see domain/indexing.js. */
export const getSettings = () => ({
  ...pick(config, SETTINGS), downloadName: config.downloadName ?? DEFAULT_DOWNLOAD_NAME, indexing: cleanIndexing(config.indexing), defaultDbPath: DEFAULT_DB_PATH,
});
export function updateSettings(patch) {
  const prev = config;
  const next = { ...config };
  for (const k of SETTINGS) {
    if (!(k in patch) || (CHOICES[k] && !CHOICES[k].includes(patch[k]))) continue;
    next[k] = k === 'gpu' ? !!patch[k] : k === 'downloadName' ? (patch[k]?.length ? patch[k] : null) : k === 'indexing' ? cleanIndexing(patch[k]) : patch[k];
  }
  config = next;
  saveConfig(config);
  emit('settings');
  // a new language relabels what the data layer returns; a new database folder is a different gallery
  if (config.language !== prev.language) emit('language');
  if (config.dbPath !== prev.dbPath) { openLibrary(config.dbPath); emit('library'); emit('tasks'); emit('snapshots'); emit('mcp'); }
  return getSettings();
}

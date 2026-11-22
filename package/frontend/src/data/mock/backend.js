// The mock backend: everything the Go service will provide, simulated in memory.
// Methods return plain data (the API layer copies it and adds latency); changes are announced through onChange().
// access.js (sign-in, server mode, MCP keys, first run) and snapshots.js (data backup) build on the pieces exported here.
import { artwork, paletteTone } from './art.js';
import { seedLibrary, buildFile, groupRecord, ago, isoOf } from './seed.js';
import { loadConfig, saveConfig, loadDbPrefs, saveDbPrefs, imageIndexReady, DEFAULT_DB_PATH } from './persist.js';
import { mergeTags, tagLabel, tagKey, norm } from '../domain/tags.js';
import { searchFiles, searchNames, splitTerms } from '../domain/search.js';
import { hashString } from '../domain/random.js';
import { kindOfExt } from '../domain/files.js';
import { keyCatalog } from '../domain/keys.js';
import { expandName, planTree, selectFiles } from '../domain/exportPlan.js';
import { uniqueName } from '../domain/filename.js';

// ------------------------------------------------------------------ change feed
const listeners = new Set();
export const emit = (topic) => { for (const fn of listeners) fn(topic); };
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let libTimer = null;
const emitLibrarySoon = () => { if (!libTimer) libTimer = setTimeout(() => { libTimer = null; emit('library'); }, 600); };

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

function indexLibrary(L) {
  L.groupsById = new Map(L.groups.map((g) => [g.id, g]));
  L.filesById = new Map(L.files.map((f) => [f.id, f]));
  L.filesByGroup = new Map(L.groups.map((g) => [g.id, []]));
  for (const f of L.files) L.filesByGroup.get(f.groupId)?.push(f);
  L.docs = null;
  L.tags = null;
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
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const GROUP_FIELDS = ['name', 'coverFileId'];
const noteEdit = (map, item, fields) => { if (!map.has(item.id)) map.set(item.id, pick(item, fields)); };

// ------------------------------------------------------------------ views of the data
/** What the pages need to show a file (the picture itself comes from mediaUrl). */
export const fileRef = (f) => ({ id: f.id, kind: f.kind, name: f.name, ext: f.ext, width: f.width, height: f.height, duration: f.duration });
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

/** A few pictures spread across the group, for glancing through it without opening it. */
function previewsOf(files, cover, n = 6) {
  const pool = files.filter((f) => f !== cover);
  if (pool.length <= n) return pool;
  return Array.from({ length: n }, (_, k) => pool[Math.floor(((k + 0.5) * pool.length) / n)]);
}

/** The cover: the one chosen, or the first picture (also for a group kept only by a snapshot). */
export function coverOf(L, g) {
  const files = L.filesByGroup.get(g.id) ?? [...L.vault.files.values()].filter((f) => f.groupId === g.id);
  const chosen = L.filesById.get(g.coverFileId) ?? L.vault.files.get(g.coverFileId);
  return chosen ?? files.find((f) => f.kind === 'image') ?? files[0] ?? null;
}

function groupCard(L, g) {
  const files = L.filesByGroup.get(g.id) ?? [];
  const cover = coverOf(L, g);
  const cfg = g.configs.find((c) => c.id === g.activeConfigId);
  return {
    id: g.id, name: g.name, createdAt: g.createdAt,
    updatedAt: files.reduce((m, f) => (f.importedAt > m ? f.importedAt : m), g.createdAt),
    fileCount: files.length,
    videoCount: files.filter((f) => f.kind === 'video').length,
    bytes: files.reduce((s, f) => s + f.size, 0),
    cover: cover ? fileRef(cover) : null,
    coverAuto: !L.filesById.has(g.coverFileId),
    previews: previewsOf(files, cover).map(fileRef),
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
  const siblings = last ? L.filesByGroup.get(last.groupId) : null;
  const week = ago(7);
  return {
    groups: orderedGroups(L).map((g) => groupCard(L, g)),
    view: getHomeView(),
    lastViewed: last ? { file: fileRef(last), group: groupChip(L, last.groupId), index: siblings.indexOf(last), total: siblings.length, viewedAt: L.prefs.lastViewed.at } : null,
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
    id: x.id, name: x.name, color: x.color, config: c.name, group: { id: g.id, name: g.name }, fileCount: count.get(x.id) ?? 0,
  }))));
}

export function getGroup(id) {
  const L = lib();
  const g = L.groupsById.get(id);
  return g ? groupCard(L, g) : null;
}

/** The pictures of a group a cover can be chosen from, newest first. */
export function groupPictures(id, limit = 120) {
  const L = lib();
  return (L.filesByGroup.get(id) ?? []).filter((f) => f.kind === 'image').slice(0, limit).map(fileRef);
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
  if ('coverFileId' in patch) {
    if (patch.coverFileId == null) g.coverFileId = null;                // automatic: the newest picture
    else if (L.filesById.get(patch.coverFileId)?.groupId === id) g.coverFileId = patch.coverFileId;
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

// ------------------------------------------------------------------ search
/** Text → pictures and picture → pictures need the image index. */
export function searchCapabilities() {
  const ready = imageIndexReady();
  return {
    semantic: { available: ready, reason: ready ? null : 'noIndex' },
    similar: { available: ready, reason: ready ? null : 'noIndex' },
  };
}

function searchDocs(L) {
  if (L.docs) return L.docs;
  L.docs = L.files.map((f) => {
    const positive = f.comfy?.positive ?? '', negative = f.comfy?.negative ?? '';
    return {
      id: f.id, groupId: f.groupId, colorIds: new Set(Object.values(f.colors)), importedAt: f.importedAt, art: f.art,
      tags: mergeTags(f.tags, f.userTags).map((t) => ({ key: t.key, label: tagLabel(t.name), source: t.source })),
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
  const tone = src ? paletteTone(src.art.palette) : q.tone;
  const scored = [];
  for (const d of docs) {
    if (d.id === q.fileId) continue;
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
      for (const t of mergeTags(f.tags, f.userTags)) {
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
    .filter((f) => f.tags.some((t) => tagKey(t.name) === k) || f.userTags.some((t) => tagKey(t) === k))
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
    // each imported file joins its group as it arrives
    const L = t.lib, g = L.groupsById.get(t.groupId), spec = L.specs[t.groupId];
    if (g && spec) {
      const f = buildFile(spec, g, spec.count + t.processed + 1, L.nextFileId(), false);
      Object.assign(f, { createdAt: ago(0.02), importedAt: nowIso() });
      L.files.push(f);
      indexLibrary(L);
      emitLibrarySoon();
    }
    t.processed++;
    if (t.processed >= t.total) finish(t, 'done', { result: { files: t.total } });
    else later(t, 420);
  },
});
registerTaskType('reindex', {
  lane: 'library', firstStage: 'preparing',
  step(t) {
    if (t.stage === 'preparing') { t.stage = t.kinds[0]; later(t, 300); return; }
    t.processed = Math.min(t.total, t.processed + 1);
    if (t.processed >= t.total) {
      const next = t.kinds[t.kinds.indexOf(t.stage) + 1];
      if (!next) { finish(t, 'done', { result: { files: t.total, kinds: t.kinds } }); return; }
      Object.assign(t, { stage: next, processed: 0 });
    }
    later(t, 180);
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

function taskView(t) {
  const L = t.lib;
  const ids = t.groupIds ?? (t.groupId ? [t.groupId] : []);
  return {
    id: t.id, type: t.type, state: t.state, stage: t.stage, processed: t.processed, total: t.total, unit: t.unit ?? 'files',
    createdAt: t.createdAt, startedAt: t.startedAt ?? null, finishedAt: t.finishedAt ?? null,
    kinds: t.kinds ?? null, label: t.label ?? null,
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
  past('model-download', 5.2, { state: 'done', stage: 'done', total: MODELS[0].size, unit: 'bytes', label: MODELS[0].name, result: { bytes: MODELS[0].size } });
  past('reindex', 5.4, { state: 'failed', stage: 'failed', groupId: 'g_land', kinds: ['tagging'], total: 486, processed: 0, error: { code: 'modelMissing' } });
  past('export', 3.1, { state: 'done', stage: 'done', groupId: 'g_kotori', total: 128, result: { files: 128, bytes: size('g_kotori'), dir: 'D:\\Exports\\Prism' } });
  past('download', 1.8, { state: 'canceled', stage: 'canceled', groupId: 'g_wall', total: 94, processed: 41 });
  past('import', 1.1, { state: 'done', stage: 'done', groupId: 'g_winter', total: 64, result: { files: 64 } });
  // in flight: the night sky is being re-tagged and indexed; a batch for the inbox waits behind it
  const run = newTask(L, { type: 'reindex', groupId: 'g_starry', kinds: ['tagging', 'embedding'], total: L.filesByGroup.get('g_starry').length });
  Object.assign(run, { state: 'running', stage: 'tagging', processed: 128, startedAt: ago(0.004), nextAt: Date.now() + 900 });
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

// ------------------------------------------------------------------ tagging models (kept next to the .exe, not in a database)
const MODELS = [{ id: 'eva02-large-v3', name: 'EVA02-Large v3', size: 1_265_000_000 }];
const GPU = { name: 'NVIDIA GeForce RTX 4070' };

/** Which models are on disk and which one tags. The sample gallery was tagged with EVA02, so it starts downloaded and in use. */
function modelState() {
  if (!config.models) patchConfig({ models: { downloaded: [MODELS[0].id], active: MODELS[0].id } });
  return config.models;
}
const setModels = (patch) => { patchConfig({ models: { ...modelState(), ...patch } }); emit('models'); };

/**
 * → { gpu: { name } | null, list: [{ id, name, size, state: 'missing' | 'downloading' | 'ready', inUse,
 *       progress: { stage, processed, total, queued } | null, taskId }] }
 */
export function getModels() {
  const st = modelState();
  return {
    gpu: GPU,
    list: MODELS.map((m) => {
      const task = activeTasks().find((t) => t.type === 'model-download' && t.modelId === m.id);
      const ready = !task && st.downloaded.includes(m.id);
      return {
        id: m.id, name: m.name, size: m.size,
        state: task ? 'downloading' : ready ? 'ready' : 'missing',
        inUse: ready && st.active === m.id,
        progress: task ? { stage: task.stage, processed: task.processed, total: task.total, queued: task.state === 'queued' } : null,
        taskId: task?.id ?? null,
      };
    }),
  };
}
export function downloadModel(id) {
  const m = MODELS.find((x) => x.id === id);
  if (!m || activeTasks().some((t) => t.modelId === id)) return { ok: false };
  const t = newTask(lib(), { type: 'model-download', modelId: id, label: m.name, total: m.size, unit: 'bytes' });
  emit('models');
  return { ok: true, taskId: t.id };
}
/** Delete the model's files, then download it again. */
export function redownloadModel(id) {
  const st = modelState();
  setModels({ downloaded: st.downloaded.filter((x) => x !== id) });
  return downloadModel(id);
}
export function useModel(id) {
  if (!modelState().downloaded.includes(id)) return { ok: false };
  setModels({ active: id });
  return { ok: true };
}
registerTaskType('model-download', {
  lane: 'model', firstStage: 'connecting',
  step(t) {
    if (t.stage === 'connecting') { t.stage = 'downloading'; later(t, 300); return; }
    t.processed = Math.min(t.total, t.processed + Math.round(t.total / (52 + Math.random() * 20)));
    if (t.processed >= t.total) finish(t, 'done', { result: { bytes: t.total } });
    else later(t, 140);
  },
  end(t) {
    if (t.state === 'done') {
      const st = modelState();
      const downloaded = [...new Set([...st.downloaded, t.modelId])];
      setModels({ downloaded, active: downloaded.includes(st.active) ? st.active : t.modelId });
    } else emit('models');
  },
});

// ------------------------------------------------------------------ settings (config.toml)
// Password, server mode and MCP have their own endpoints (access.js).
const SETTINGS = ['language', 'theme', 'dbPath', 'conflict', 'gpu', 'whiteboard', 'downloadName'];
const CHOICES = { language: ['en', 'zh-CN'], theme: ['light', 'dark'], conflict: ['keep', 'skip', 'overwrite'], whiteboard: ['auto', 'webgl', 'dom'] };
/** Downloads keep each file's own name unless the user sets a pattern. */
const DEFAULT_DOWNLOAD_NAME = [{ type: 'key', kind: 'data', id: 'file.name' }];

export const getSettings = () => ({ ...pick(config, SETTINGS), downloadName: config.downloadName ?? DEFAULT_DOWNLOAD_NAME, defaultDbPath: DEFAULT_DB_PATH });
export function updateSettings(patch) {
  const prev = config;
  const next = { ...config };
  for (const k of SETTINGS) {
    if (!(k in patch) || (CHOICES[k] && !CHOICES[k].includes(patch[k]))) continue;
    next[k] = k === 'gpu' ? !!patch[k] : k === 'downloadName' ? (patch[k]?.length ? patch[k] : null) : patch[k];
  }
  config = next;
  saveConfig(config);
  emit('settings');
  // a new language relabels what the data layer returns; a new database folder is a different gallery
  if (config.language !== prev.language) emit('language');
  if (config.dbPath !== prev.dbPath) { openLibrary(config.dbPath); emit('library'); emit('tasks'); emit('snapshots'); emit('mcp'); }
  return getSettings();
}

// The mock backend: everything the Go service will provide, simulated in memory.
// Methods return plain data (the API layer copies it and adds latency); changes are announced through onChange().
import { artwork, paletteTone } from './art.js';
import { seedLibrary, buildFile, groupRecord, ago, isoOf } from './seed.js';
import { loadConfig, saveConfig, loadDbPrefs, saveDbPrefs, imageIndexReady, DEFAULT_DB_PATH } from './persist.js';
import { mergeTags, tagLabel, tagKey, norm } from '../domain/tags.js';
import { searchFiles, searchNames, splitTerms } from '../domain/search.js';
import { hashString } from '../domain/random.js';

// ------------------------------------------------------------------ change feed
const listeners = new Set();
export const emit = (topic) => { for (const fn of listeners) fn(topic); };
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let libTimer = null;
const emitLibrarySoon = () => { if (!libTimer) libTimer = setTimeout(() => { libTimer = null; emit('library'); }, 600); };

// ------------------------------------------------------------------ galleries (one per database directory)
let config = loadConfig();
const libraries = new Map();
const nowIso = () => isoOf(new Date());

function emptyLibrary() {
  let f = 90000;
  return { groups: [], files: [], nextFileId: () => `f_${++f}`, specs: {} };
}

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
    L = { path, seeded: seededLib, ...(seededLib ? seedLibrary() : emptyLibrary()), prefs: loadDbPrefs(path) };
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
const savePrefs = (L) => saveDbPrefs(L.path, L.prefs);

// ------------------------------------------------------------------ views of the data
/** What the pages need to show a file (the picture itself comes from mediaUrl). */
const fileRef = (f) => ({ id: f.id, kind: f.kind, name: f.name, ext: f.ext, width: f.width, height: f.height, duration: f.duration });
const groupChip = (L, id) => { const g = L.groupsById.get(id); return g ? { id: g.id, name: g.name } : null; };

/** Groups in the user's order (set by dragging on the home page); ones never placed come first, newest first. */
function orderedGroups(L) {
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

function coverOf(L, g) {
  const files = L.filesByGroup.get(g.id) ?? [];
  return L.filesById.get(g.coverFileId) ?? files.find((f) => f.kind === 'image') ?? files[0] ?? null;
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
 * poster frame. The Go service serves these from the database directory; the mock paints them.
 */
export function mediaUrl(ref, quality = 'original') {
  const f = lib().filesById.get(ref?.id);
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

/** Every group, for pickers (search scopes and the like). */
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
  if ('name' in patch) { const n = String(patch.name ?? '').trim(); if (!n) return null; g.name = n; }
  if ('coverFileId' in patch) {
    if (patch.coverFileId == null) g.coverFileId = null;                // automatic: the newest picture
    else if (L.filesById.get(patch.coverFileId)?.groupId === id) g.coverFileId = patch.coverFileId;
  }
  indexLibrary(L);
  emit('library');
  return groupCard(L, g);
}

/** Deleting a group deletes the files in it (the Go service moves them to the system's recycle bin). */
export function deleteGroup(id) {
  const L = lib();
  if (!L.groupsById.has(id)) return { ok: false };
  const removed = L.filesByGroup.get(id)?.length ?? 0;
  L.groups = L.groups.filter((g) => g.id !== id);
  L.files = L.files.filter((f) => f.groupId !== id);
  if (L.prefs.groupOrder) L.prefs.groupOrder = L.prefs.groupOrder.filter((x) => x !== id);
  if (L.filesById.get(L.prefs.lastViewed?.fileId)?.groupId === id) L.prefs.lastViewed = null;
  savePrefs(L);
  indexLibrary(L);
  emit('library');
  return { ok: true, files: removed };
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
const tasks = [];
let taskSeq = 100;
let ticker = null;

function newTask(L, t) {
  const task = { id: `t_${++taskSeq}`, lib: L, state: 'queued', stage: 'queued', processed: 0, total: 0, createdAt: nowIso(), ...t };
  tasks.push(task);
  emit('tasks');
  if (!ticker) ticker = setInterval(tick, 120);
  return task;
}
function finish(t, state, extra = {}) {
  Object.assign(t, { state, stage: state, finishedAt: nowIso() }, extra);
  emit('tasks'); emit('library');
}

const FIRST_STAGE = { import: 'preparing', reindex: 'preparing', export: 'preparing', 'model-download': 'connecting', download: 'packing' };
const PACE = { import: 420, reindex: 180, export: 90, 'model-download': 140, download: 110 };

// One task at a time: the gallery's work runs in the background, one job after another.
function tick() {
  let t = tasks.find((x) => x.state === 'running');
  if (!t) {
    t = tasks.find((x) => x.state === 'queued');
    if (t) { Object.assign(t, { state: 'running', stage: FIRST_STAGE[t.type], startedAt: nowIso(), nextAt: Date.now() + 900 }); emit('tasks'); }
  } else if (Date.now() >= t.nextAt) advance(t);
  if (!tasks.some((x) => x.state === 'running' || x.state === 'queued')) { clearInterval(ticker); ticker = null; }
}

function advance(t) {
  const L = t.lib;
  if (t.stage === 'preparing' || t.stage === 'connecting') {
    t.stage = { import: 'importing', reindex: t.kinds[0], export: 'copying', 'model-download': 'downloading' }[t.type];
    t.nextAt = Date.now() + 300; emit('tasks'); return;
  }
  if (t.type === 'import') {
    // each imported file joins its group as it arrives
    const g = L.groupsById.get(t.groupId), spec = L.specs[t.groupId];
    if (g && spec) {
      const f = buildFile(spec, g, spec.count + t.processed + 1, L.nextFileId(), false);
      Object.assign(f, { createdAt: ago(0.02), importedAt: nowIso() });
      L.files.push(f);
      indexLibrary(L);
      emitLibrarySoon();
    }
    t.processed++;
    if (t.processed >= t.total) return finish(t, 'done', { result: { files: t.total } });
  } else if (t.type === 'reindex') {
    t.processed = Math.min(t.total, t.processed + 1);
    if (t.processed >= t.total) {
      const next = t.kinds[t.kinds.indexOf(t.stage) + 1];
      if (!next) return finish(t, 'done', { result: { files: t.total, kinds: t.kinds } });
      Object.assign(t, { stage: next, processed: 0 });
    }
  } else {
    t.processed = Math.min(t.total, t.processed + Math.max(1, Math.ceil(t.total / 60)));
    if (t.processed >= t.total) return finish(t, 'done', { result: t.result });
  }
  t.nextAt = Date.now() + PACE[t.type];
  emit('tasks');
}

function taskView(t) {
  const L = t.lib;
  return {
    id: t.id, type: t.type, state: t.state, stage: t.stage, processed: t.processed, total: t.total, unit: t.unit ?? 'files',
    createdAt: t.createdAt, startedAt: t.startedAt ?? null, finishedAt: t.finishedAt ?? null,
    kinds: t.kinds ?? null, label: t.label ?? null,
    group: t.groupId ? groupChip(L, t.groupId) ?? { id: t.groupId, name: t.groupName } : null,
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
  // in flight: the night sky is being re-tagged and indexed; a batch for the inbox waits behind it
  const run = newTask(L, { type: 'reindex', groupId: 'g_starry', kinds: ['tagging', 'embedding'], total: L.filesByGroup.get('g_starry').length });
  Object.assign(run, { state: 'running', stage: 'tagging', processed: 128, startedAt: ago(0.004), nextAt: Date.now() + 900 });
  newTask(L, { type: 'import', groupId: 'g_inbox', total: 24 });
}

// ------------------------------------------------------------------ settings
// Only the general settings travel through here for now.
const GENERAL = ['language', 'theme', 'dbPath'];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
export const getSettings = () => ({ ...pick(config, GENERAL), defaultDbPath: DEFAULT_DB_PATH });
export function updateSettings(patch) {
  const prevPath = config.dbPath;
  config = { ...config, ...pick({ ...config, ...patch }, GENERAL) };
  saveConfig(config);
  emit('settings');
  if (config.dbPath !== prevPath) { openLibrary(config.dbPath); emit('library'); emit('tasks'); }
  return getSettings();
}

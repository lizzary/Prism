// The mock's index: the models that build it (tagging and image index — kept next to the .exe, not in a database),
// every file's index of each kind, the tasks that build it, and indexing by itself — as files are uploaded, and when
// a rule of automatic indexing is met (a reminder, and/or indexing the waiting files in the background).
// Built on backend.js (the gallery, its tasks, config.toml). Topics: 'models' · 'index' (files' index) · 'reminder'.
//
// A file keeps a record per kind: { by: what built it (a model id, or the metadata reader), at } — or { failed: true }.
// Its state of a kind follows from that and from what builds the kind now (domain/indexing.js INDEX_STATES).
import {
  emit, onChange, currentLibrary, openedLibrary, getConfig, patchConfig, registerTaskType, newTask, finish, activeTasks,
  onLibraryOpen, onTaskEnd, setImageIndexer, fileRef, orderedGroups, coverOf,
} from './backend.js';
import { imageIndexReady } from './persist.js';
import { isoOf } from './seed.js';
import { seeded } from '../domain/random.js';
import { INDEX_KINDS, MODEL_KINDS, NEEDS_WORK, cleanIndexing, backlogLevel, rulesMet, hoursSince, AGE_REMIND_EVERY_H } from '../domain/indexing.js';

const H = 3_600_000;
const nowIso = () => isoOf(new Date());
const NEEDS = new Set(NEEDS_WORK);
const later = (t, ms) => { t.nextAt = Date.now() + ms; emit('tasks'); };
let indexTimer = 0;
/** Files' index changes come in bursts while a task runs: they are announced a few times a second at most. */
const emitIndexSoon = () => { if (!indexTimer) indexTimer = setTimeout(() => { indexTimer = 0; emit('index'); }, 400); };

// ------------------------------------------------------------------ models
const MODELS = {
  tagging: [
    { id: 'eva02-large-v3', name: 'EVA02-Large v3', size: 1_265_000_000 },
    { id: 'swinv2-v3', name: 'SwinV2 v3', size: 467_000_000 },
    { id: 'vit-large-v3', name: 'ViT-Large v3', size: 1_262_000_000 },
    { id: 'convnext-v3', name: 'ConvNeXt v3', size: 394_000_000 },
    { id: 'camie-v2', name: 'Camie Tagger v2 · 70,527 tags', size: 572_000_000 },
  ],
  embedding: [
    { id: 'siglip2-so400m', name: 'SigLIP 2 So400m/16', size: 1_642_000_000 },
    { id: 'clip-vit-l14', name: 'CLIP ViT-L/14', size: 1_710_000_000 },
    { id: 'chinese-clip-h14', name: 'Chinese-CLIP ViT-H/14 · 中文', size: 3_918_000_000 },
    { id: 'mobileclip-s2', name: 'MobileCLIP S2', size: 398_000_000 },
  ],
};
const MODEL_BY_ID = new Map(MODEL_KINDS.flatMap((kind) => MODELS[kind].map((m) => [m.id, { ...m, kind }])));
const GPU = { name: 'NVIDIA GeForce RTX 4070' };
/** What reads metadata now: metadata read by an older reader is outdated. */
const METADATA_READER = 'meta-2';

/**
 * Which models are on disk and which one builds each kind. The sample was tagged with EVA02 (SwinV2, used before, is
 * still on disk); it has no image index model unless `?image-search` asks for one. (config.toml from before image
 * index models knew only the tagging model: it is read as that.)
 */
function modelState() {
  const cfg = getConfig();
  let m = cfg.models;
  if (!m?.tagging) {
    const tagging = m?.downloaded ? { downloaded: m.downloaded, active: m.active ?? null } : { downloaded: ['eva02-large-v3', 'swinv2-v3'], active: 'eva02-large-v3' };
    m = { tagging, embedding: { downloaded: [], active: null } };
  }
  if (imageIndexReady() && !m.embedding.downloaded.length) m = { ...m, embedding: { downloaded: ['siglip2-so400m'], active: 'siglip2-so400m' } };
  if (m !== cfg.models) patchConfig({ models: m });
  return m;
}
const setModels = (kind, patch) => { const st = modelState(); patchConfig({ models: { ...st, [kind]: { ...st[kind], ...patch } } }); };

/** What builds a kind now: the model in use (downloaded), the metadata reader — or nothing (null). */
function builderOf(kind) {
  if (kind === 'metadata') return METADATA_READER;
  const k = modelState()[kind];
  return k.active && k.downloaded.includes(k.active) ? k.active : null;
}
const builders = () => Object.fromEntries(INDEX_KINDS.map((k) => [k, builderOf(k)]));
setImageIndexer(() => builderOf('embedding'));

/** A model came, went or changed: what files' index means changes with it (and so does what search can do). */
function modelsChanged() {
  const L = openedLibrary();
  if (L) { L.docs = null; L.tags = null; }
  emit('models'); emit('index'); emit('library');
}

/**
 * → { gpu: { name } | null, list: [{ id, kind: 'tagging' | 'embedding', name, size, state: 'missing' | 'downloading' | 'ready',
 *       inUse, progress: { stage, processed, total, queued } | null, taskId }] } (each kind's in its own order)
 */
export function getModels() {
  const st = modelState();
  const running = activeTasks();
  return {
    gpu: GPU,
    list: MODEL_KINDS.flatMap((kind) => MODELS[kind].map((m) => {
      const task = running.find((t) => t.type === 'model-download' && t.modelId === m.id);
      const ready = !task && st[kind].downloaded.includes(m.id);
      return {
        id: m.id, kind, name: m.name, size: m.size,
        state: task ? 'downloading' : ready ? 'ready' : 'missing',
        inUse: ready && st[kind].active === m.id,
        progress: task ? { stage: task.stage, processed: task.processed, total: task.total, queued: task.state === 'queued' } : null,
        taskId: task?.id ?? null,
      };
    })),
  };
}
export function downloadModel(id) {
  const m = MODEL_BY_ID.get(id);
  if (!m || activeTasks().some((t) => t.modelId === id)) return { ok: false };
  const t = newTask(currentLibrary(), { type: 'model-download', modelId: id, label: m.name, total: m.size, unit: 'bytes' });
  emit('models');
  return { ok: true, taskId: t.id };
}
/** Delete the model's files, then download it again (its kind cannot be built meanwhile). */
export function redownloadModel(id) {
  const m = MODEL_BY_ID.get(id);
  if (!m) return { ok: false };
  setModels(m.kind, { downloaded: modelState()[m.kind].downloaded.filter((x) => x !== id) });
  modelsChanged();
  return downloadModel(id);
}
/** Build a kind with another downloaded model: what the one before built is outdated now. → { ok, previous } */
export function useModel(id) {
  const m = MODEL_BY_ID.get(id);
  const st = modelState()[m?.kind];
  if (!m || !st.downloaded.includes(id)) return { ok: false };
  setModels(m.kind, { active: id });
  modelsChanged();
  return { ok: true, previous: st.active };
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
    const kind = MODEL_BY_ID.get(t.modelId)?.kind;
    if (t.state === 'done' && kind) {
      const st = modelState()[kind];
      const downloaded = [...new Set([...st.downloaded, t.modelId])];
      // the first model of its kind is put to use at once; one downloaded again goes back to what it was doing
      setModels(kind, { downloaded, active: st.active && downloaded.includes(st.active) ? st.active : t.modelId });
    }
    modelsChanged();
  },
});

// ------------------------------------------------------------------ every file's index
const INDEX_TASKS = new Set(['index', 'reindex']);
/** The library's indexing: when it last ran, and where the reminders stand. */
function stateFor(L) {
  L.indexing ??= { lastAt: null, level: null, ageAt: null, reminder: null };
  return L.indexing;
}

/** Files an index task has not reached yet, per kind (they show as queued). */
function queuedIds(L) {
  const q = Object.fromEntries(INDEX_KINDS.map((k) => [k, new Set()]));
  for (const t of activeTasks()) {
    if (t.lib !== L || !INDEX_TASKS.has(t.type) || !t.plan) continue;
    const at = t.state === 'running' ? t.kinds.indexOf(t.stage) : -1;       // -1: not started (or preparing)
    t.kinds.forEach((kind, i) => {
      const ids = t.plan[kind];
      for (let j = i < at ? ids.length : i === at ? t.processed : 0; j < ids.length; j++) q[kind].add(ids[j]);
    });
  }
  return q;
}
function stateOf(f, kind, by, queued) {
  if (!by) return 'off';
  if (queued.has(f.id)) return 'queued';
  const r = f.index?.[kind];
  if (!r) return 'missing';
  if (r.failed) return 'failed';
  return r.by === by ? 'done' : 'stale';
}
const statesOf = (f, by, q) => ({
  tagging: stateOf(f, 'tagging', by.tagging, q.tagging),
  embedding: stateOf(f, 'embedding', by.embedding, q.embedding),
  metadata: stateOf(f, 'metadata', by.metadata, q.metadata),
});
/** Still to be built: some kind that can be built is outdated, not indexed or failed (being built does not count). */
const isWaiting = (states) => NEEDS.has(states.tagging) || NEEDS.has(states.embedding) || NEEDS.has(states.metadata);
/** Newest first (ISO moments compare as text — far quicker than a collator over thousands of files). */
const newestFirst = (a, b) => (a.importedAt < b.importedAt ? 1 : a.importedAt > b.importedAt ? -1 : 0);
const latestAt = (f) => INDEX_KINDS.reduce((m, k) => { const at = f.index?.[k]?.at; return at && (!m || at > m) ? at : m; }, null);

function waitingCount(L) {
  const by = builders(), q = queuedIds(L);
  let n = 0;
  for (const f of L.files) if (isWaiting(statesOf(f, by, q))) n++;
  return n;
}
/** Each waiting file (of a group, or of the gallery), with the kinds it still needs. → { kind: [file id] } */
function waitingPlan(L, groupId = null) {
  const by = builders(), q = queuedIds(L);
  const plan = Object.fromEntries(INDEX_KINDS.map((k) => [k, []]));
  for (const f of groupId ? L.filesByGroup.get(groupId) ?? [] : L.files) {
    for (const k of INDEX_KINDS) if (NEEDS.has(stateOf(f, k, by[k], q[k]))) plan[k].push(f.id);
  }
  return plan;
}

// (covers of the overview's groups, kept while the gallery stays the same)
const coverCache = { rev: -1, map: new Map() };
function groupCover(L, g) {
  if (coverCache.rev !== L.rev) { coverCache.rev = L.rev; coverCache.map = new Map(); }
  if (!coverCache.map.has(g.id)) { const c = coverOf(L, g); coverCache.map.set(g.id, c ? fileRef(c) : null); }
  return coverCache.map.get(g.id);
}
const counts = () => ({ done: 0, stale: 0, missing: 0, failed: 0, queued: 0 });
const EMPTY_KINDS = Object.fromEntries(INDEX_KINDS.map((k) => [k, { available: k === 'metadata', model: null, ...counts() }]));

/**
 * The whole gallery's index at a glance.
 * → { total, waiting (files still to be built), needs (files not up to date, being built included), lastIndexedAt,
 *     kinds: { kind: { available (something builds it), model: { id, name } | null, done, stale, missing, failed, queued } },
 *     active: the index task under way { id, type, state, stage, processed, total, kinds, files, origin, groups: [name] } | null, tasks (index tasks to do),
 *     groups: [{ id, name, cover, total, waiting, needs, kinds: { kind: counts } }] (in the gallery's order) }
 */
export function getIndexOverview() {
  const L = openedLibrary();
  if (!L) return { total: 0, waiting: 0, needs: 0, lastIndexedAt: null, kinds: EMPTY_KINDS, active: null, tasks: 0, groups: [] };
  const S = stateFor(L);
  const by = builders(), q = queuedIds(L);
  const kinds = Object.fromEntries(INDEX_KINDS.map((k) => [k, counts()]));
  const groups = new Map(orderedGroups(L).map((g) => [g.id, { g, total: 0, waiting: 0, needs: 0, kinds: Object.fromEntries(INDEX_KINDS.map((k) => [k, counts()])) }]));
  let waiting = 0, needs = 0;
  for (const f of L.files) {
    const G = groups.get(f.groupId);
    const states = statesOf(f, by, q);
    let n = false;
    for (const k of INDEX_KINDS) {
      const s = states[k];
      if (s === 'off') continue;
      kinds[k][s]++;
      if (G) G.kinds[k][s]++;
      if (s !== 'done') n = true;
    }
    const w = isWaiting(states);
    if (G) { G.total++; if (w) G.waiting++; if (n) G.needs++; }
    if (w) waiting++;
    if (n) needs++;
  }
  const mine = activeTasks().filter((t) => t.lib === L && INDEX_TASKS.has(t.type));
  const task = mine.find((t) => t.state === 'running') ?? mine[0];
  return {
    total: L.files.length, waiting, needs, lastIndexedAt: S.lastAt,
    kinds: Object.fromEntries(INDEX_KINDS.map((k) => [k, {
      available: !!by[k], model: by[k] && k !== 'metadata' ? { id: by[k], name: MODEL_BY_ID.get(by[k])?.name ?? by[k] } : null, ...kinds[k],
    }])),
    active: task ? {
      id: task.id, type: task.type, state: task.state, stage: task.stage, processed: task.processed, total: task.total,
      kinds: task.kinds, files: task.files, origin: task.origin ?? null,
      groups: (task.groupIds ?? []).map((id) => L.groupsById.get(id)?.name).filter(Boolean),
    } : null,
    tasks: mine.length,
    groups: [...groups.values()].map(({ g, ...x }) => ({ id: g.id, name: g.name, cover: groupCover(L, g), ...x })),
  };
}

/**
 * Files and their index, for the index page's list: of one group (or all, in the gallery's order), newest first.
 * show: 'needs' (not up to date) | 'all'; kind + state narrow it to one kind — state: an INDEX_STATE, or 'needs'; text: in the name.
 * → { rows: [ref + { groupId, states: { kind: state }, needs: [kind] (still to be built), at (when it was last indexed) }] }
 */
export function getIndexFiles({ groupId = null, show = 'needs', kind = null, state = null, text = '' } = {}) {
  const L = currentLibrary();
  const by = builders(), q = queuedIds(L);
  const words = String(text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const rows = [];
  for (const g of orderedGroups(L)) {
    if (groupId && g.id !== groupId) continue;
    const files = [...(L.filesByGroup.get(g.id) ?? [])].sort(newestFirst);
    for (const f of files) {
      const states = statesOf(f, by, q);
      if (kind && state) {
        const s = states[kind];
        if (state === 'needs' ? s === 'done' || s === 'off' : s !== state) continue;
      } else if (show === 'needs' && INDEX_KINDS.every((k) => states[k] === 'done' || states[k] === 'off')) continue;
      if (words.length) { const name = `${f.name}.${f.ext}`.toLowerCase(); if (!words.every((w) => name.includes(w))) continue; }
      rows.push({ ...fileRef(f), groupId: f.groupId, states, needs: INDEX_KINDS.filter((k) => NEEDS.has(states[k])), at: latestAt(f) });
    }
  }
  return { rows };
}

/** The waiting files of a group (the whiteboard chooses them all at once). → { ids } */
export function waitingIn(groupId) {
  const L = currentLibrary();
  const by = builders(), q = queuedIds(L);
  return { ids: (L.filesByGroup.get(groupId) ?? []).filter((f) => isWaiting(statesOf(f, by, q))).map((f) => f.id) };
}

/** How many of these files still need each kind built. → { tagging, embedding, metadata } */
export function indexNeeds(ids) {
  const L = currentLibrary();
  const by = builders(), q = queuedIds(L);
  const needs = Object.fromEntries(INDEX_KINDS.map((k) => [k, 0]));
  for (const id of ids ?? []) {
    const f = L.filesById.get(id);
    if (f) for (const k of INDEX_KINDS) if (NEEDS.has(stateOf(f, k, by[k], q[k]))) needs[k]++;
  }
  return needs;
}

// ------------------------------------------------------------------ building it
/** Work per step: a few files at a time one by one, a great many in slices — a kind takes about a hundred steps at most. */
const sliceOf = (n) => Math.max(1, Math.ceil(n / 100));

/**
 * A task that builds `plan` ({ kind: [file id] }), kind after kind. type: 'reindex' (files chosen to build again) |
 * 'index' (files waiting, or just uploaded) · origin: 'waiting' | 'upload' | 'auto' (a rule) | null.
 */
function startIndexTask(L, { type = 'index', plan, origin = null }) {
  const kinds = INDEX_KINDS.filter((k) => plan[k]?.length);
  if (!kinds.length) return null;
  const all = new Set(kinds.flatMap((k) => plan[k]));
  const groupIds = [...new Set([...all].map((id) => L.filesById.get(id)?.groupId).filter(Boolean))];
  const t = newTask(L, {
    type, plan, kinds, files: all.size, total: plan[kinds[0]].length, origin, groupIds, groupId: groupIds.length === 1 ? groupIds[0] : undefined,
  });
  emitIndexSoon();
  return t;
}
function turnTo(t, k) {
  t.stage = t.kinds[k];
  t.processed = 0;
  t.total = t.plan[t.stage].length;
  t.chunk = sliceOf(t.total);
  emitIndexSoon();                                    // (its files are being built now, not only waiting for it)
  later(t, 280);
}
const indexRunner = {
  lane: 'library', firstStage: 'preparing',
  step(t) {
    if (t.stage === 'preparing') { turnTo(t, 0); return; }
    const L = t.lib, kind = t.stage, ids = t.plan[kind];
    const by = builderOf(kind);                       // (none if its model went away meanwhile: those files stay as they were)
    const n = Math.min(t.chunk, ids.length - t.processed);
    const at = nowIso();
    for (let i = 0; i < n; i++) {
      const f = L.filesById.get(ids[t.processed + i]);
      if (f && by) f.index = { ...f.index, [kind]: { by, at } };
    }
    t.processed += n;
    if (kind !== 'metadata') { L.docs = null; L.tags = null; }
    emitIndexSoon();
    if (t.processed < ids.length) { later(t, 170); return; }
    if (kind !== 'metadata') emit('library');         // the tags just made, the pictures just indexed show where they are used
    const k = t.kinds.indexOf(kind) + 1;
    if (k < t.kinds.length) turnTo(t, k);
    else finish(t, 'done', { result: { files: t.files, kinds: t.kinds } });
  },
  end(t) {
    if (t.state === 'done') stateFor(t.lib).lastAt = nowIso();
    emitIndexSoon();
  },
};
registerTaskType('index', indexRunner);
registerTaskType('reindex', indexRunner);

/**
 * Build these kinds again for the chosen files: any of 'tagging' (the user's own tags stay), 'embedding', 'metadata'.
 * → { ok, taskId } | { ok: false, error: 'modelMissing' | 'imageModelMissing' }
 */
export function reindexFiles({ ids, kinds }) {
  const L = currentLibrary();
  const files = (ids ?? []).filter((id) => L.filesById.has(id));
  const valid = INDEX_KINDS.filter((k) => kinds?.includes(k));
  if (!files.length || !valid.length) return { ok: false };
  const off = valid.find((k) => !builderOf(k));
  if (off) return { ok: false, error: off === 'embedding' ? 'imageModelMissing' : 'modelMissing' };
  const t = startIndexTask(L, { type: 'reindex', plan: Object.fromEntries(valid.map((k) => [k, files])) });
  return { ok: true, taskId: t.id };
}

/** Index every waiting file (of a group, or of the gallery), each with the kinds it still needs. → { ok, taskId, files } */
export function indexWaiting({ groupId = null } = {}) {
  const L = currentLibrary();
  const t = startIndexTask(L, { plan: waitingPlan(L, groupId), origin: 'waiting' });
  return t ? { ok: true, taskId: t.id, files: t.files } : { ok: false };
}

// ------------------------------------------------------------------ indexing by itself
/** Files arriving in one go: they count once, when all of them are in. */
const BATCHES = new Set(['upload', 'import']);
let ruleTimer = 0, rebaseNext = false;
/** Look at the rules soon (changes come in bursts). `rebase`: the rules themselves changed — that is no reason to remind. */
function scheduleRules({ rebase = false } = {}) {
  rebaseNext ||= rebase;
  clearTimeout(ruleTimer);
  ruleTimer = setTimeout(() => { const r = rebaseNext; rebaseNext = false; checkRules(r); }, 350);
}

function checkRules(rebase) {
  const L = openedLibrary();
  if (!L) return;
  const S = stateFor(L);
  // files arriving right now count once they are all in (one waiting its turn has brought nothing yet)
  if (activeTasks().some((t) => t.lib === L && BATCHES.has(t.type) && t.state === 'running')) return;
  const settings = cleanIndexing(getConfig().indexing), a = settings.auto;
  const waiting = waitingCount(L);
  const met = rulesMet(settings, { waiting, lastIndexedAt: S.lastAt });
  // the waiting files: a reminder each time they reach another multiple — once for a whole batch, however big
  const level = backlogLevel(waiting, a.backlog.count);
  const rose = !rebase && S.level != null && level > S.level;
  S.level = level;
  // in the background: the waiting files are indexed, unless an index task is under way already
  const busy = activeTasks().some((t) => t.lib === L && INDEX_TASKS.has(t.type));
  const started = !busy && ((met.backlog && a.backlog.background) || (met.age && a.age.background))
    ? startIndexTask(L, { plan: waitingPlan(L), origin: 'auto' }) : null;
  // the time: at most once a day while it holds
  const ageDue = met.age && a.age.remind && (S.ageAt == null || Date.now() - S.ageAt >= AGE_REMIND_EVERY_H * H);
  if (ageDue) S.ageAt = Date.now();
  const rule = rose && met.backlog && a.backlog.remind ? 'backlog' : ageDue ? 'age' : null;
  if (!rule) return;
  S.reminder = { id: `r${Date.now().toString(36)}`, rule, waiting, hours: S.lastAt ? Math.floor(hoursSince(S.lastAt)) : null, started: started?.files ?? 0, at: nowIso() };
  emit('reminder');
}

/** The reminder showing now (of the gallery in use): { id, rule: 'backlog' | 'age', waiting, hours, started (files a background run took), at } | null */
export const getReminder = () => { const L = openedLibrary(); return L ? stateFor(L).reminder : null; };
/**
 * The reminder seen (or put off). `mute`: not to be reminded again — the rules stop reminding (they still index in the
 * background if asked to). → { ok, was: { backlog, age } } (what reminded before, to undo it)
 */
export function dismissReminder(id, { mute = false } = {}) {
  const S = stateFor(currentLibrary());
  if (id && S.reminder?.id === id) { S.reminder = null; emit('reminder'); }
  if (!mute) return { ok: true };
  const cur = cleanIndexing(getConfig().indexing);
  const was = { backlog: cur.auto.backlog.remind, age: cur.auto.age.remind };
  patchConfig({ indexing: { ...cur, auto: { ...cur.auto, backlog: { ...cur.auto.backlog, remind: false }, age: { ...cur.auto.age, remind: false } } } });
  emit('settings');
  return { ok: true, was };
}

onChange((topic) => {
  if (topic === 'settings') scheduleRules({ rebase: true });
  else if (topic === 'library' || topic === 'models') scheduleRules();
});
onTaskEnd((t) => {
  // uploaded files are indexed right away, if asked (kinds with no model in use are skipped)
  if (t.type === 'upload' && t.created?.length) {
    const up = cleanIndexing(getConfig().indexing).upload;
    const ids = t.created.filter((id) => t.lib.filesById.has(id));
    if (up.on && ids.length) startIndexTask(t.lib, { plan: Object.fromEntries(up.kinds.filter(builderOf).map((k) => [k, ids])), origin: 'upload' });
  }
  if (BATCHES.has(t.type) || INDEX_TASKS.has(t.type)) scheduleRules();
});

// the time rule holds as time passes: it is looked at every minute too
let clock = 0;
const startClock = () => { clock ||= setInterval(() => scheduleRules(), 60_000); };

/**
 * The sample's index, as months of use leave it: each file indexed some time after it arrived, the last run 26 hours
 * ago (what arrived since is waiting); the 2023 archive tagged with the tagging model used back then (outdated now); a
 * few files the metadata reader could not read; an image index only if a model is in use (`?image-search`) — and,
 * under way, the night sky being tagged again (indexed for the first time too, with an image index model).
 */
function seedIndex(L) {
  const S = stateFor(L);
  const last = Date.now() - 26 * H;
  S.lastAt = isoOf(new Date(last));
  const imager = builderOf('embedding');
  for (const f of L.files) {
    f.index = {};
    const arrived = Date.parse(f.importedAt);
    if (arrived > last) continue;
    const at = isoOf(new Date(Math.min(last, arrived + seeded(`index|${f.id}`).range(0.2, 30) * H)));
    f.index.metadata = { by: METADATA_READER, at };
    f.index.tagging = { by: f.groupId === 'g_archive' ? 'swinv2-v3' : 'eva02-large-v3', at };
    if (imager && f.groupId !== 'g_starry') f.index.embedding = { by: imager, at };
  }
  for (const [gid, k] of [['g_motion', 2], ['g_motion', 9], ['g_street', 40], ['g_archive', 120]]) {
    const f = L.filesByGroup.get(gid)?.[k];
    if (f?.index.metadata) f.index.metadata = { ...f.index.metadata, failed: true };
  }
  const starry = L.filesByGroup.get('g_starry') ?? [];
  if (!starry.length) return;
  const ids = starry.map((f) => f.id);
  const t = startIndexTask(L, { type: 'reindex', plan: Object.fromEntries((imager ? ['tagging', 'embedding'] : ['tagging']).map((k) => [k, ids])) });
  const done = 128;
  for (const f of starry.slice(0, done)) f.index.tagging = { by: 'eva02-large-v3', at: nowIso() };
  Object.assign(t, { state: 'running', stage: 'tagging', processed: done, chunk: sliceOf(ids.length), startedAt: isoOf(new Date(Date.now() - 6 * 60_000)), nextAt: Date.now() + 900 });
}

onLibraryOpen((L) => {
  if (L.seeded) seedIndex(L);
  else for (const f of L.files) f.index ??= {};
  // what is waiting as the gallery opens is known already: reminders count from here
  stateFor(L).level = backlogLevel(waitingCount(L), cleanIndexing(getConfig().indexing).auto.backlog.count);
  startClock();
  scheduleRules();
  emitIndexSoon();
});

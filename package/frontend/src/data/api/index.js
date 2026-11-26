// The data layer's public API. The UI never talks to the backend directly: it goes through the bridge hooks,
// which call these functions. Today they are served by the in-memory mock backend (backend · access · snapshots);
// replacing those modules with an HTTP/SSE client against the Go service keeps this surface unchanged.
import * as backend from '../mock/backend.js';
import * as accessBackend from '../mock/access.js';
import * as snapshotBackend from '../mock/snapshots.js';
import * as indexBackend from '../mock/indexing.js';
import * as statsBackend from '../mock/stats.js';
import { acceptable, probe, renderDownload } from '../mock/files.js';
import { QUALITIES, FILE_KINDS } from '../domain/files.js';
import { stripIllegal, validateTemplate } from '../domain/filename.js';
import {
  arrange, placeBatch, pageOf, pageOfSection, NONE, DEFAULT_VIEW, SORTS, QUALITY_LEVELS, LAYOUTS, PAGE_SIZES, SIZE_LEVELS, SLIDE_RANGE, SLIDE_SECONDS,
} from '../domain/arrange.js';
import { COLOR_SORTS, findInName, moveTogether, sortColorGroups, stepTogether } from '../domain/colorOrder.js';
import { autoCovers, coverEdits, MAX_COVERS } from '../domain/covers.js';
import { PLAIN as PLAIN_BOARD } from '../domain/board.js';
import { INDEX_KINDS, RULE_LIMITS, AGE_REMIND_EVERY_H, remindStep, nextReminderAt } from '../domain/indexing.js';
import {
  STORAGE_PARTS, SIZE_BUCKETS, FILE_TYPES, OTHER_TYPE, ACTIVITY_METRICS, ACTIVITY_RANGES, DEFAULT_RANGE,
  typeOf, dayOf, addDays, daysBetween, weekdayOf, streaks, movingAverage, metricOf, usedOn,
} from '../domain/stats.js';

export { FILE_KINDS };

const LATENCY = { read: [80, 200], write: [160, 320], auth: [420, 680], heavy: [1400, 2000] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = ([a, b]) => a + Math.random() * (b - a);
const copy = (v) => (v == null ? v : structuredClone(v));

async function call(kind, fn) {
  await wait(jitter(LATENCY[kind]));
  return copy(fn());
}

/**
 * A pushed value (tasks, settings, access, models): subscribe + current snapshot, for useSyncExternalStore.
 * Subscribers hear only of real changes: a topic that fires without changing the value keeps the same snapshot.
 * `pace` (ms): progress is passed on at most this often — what `urgent(before, after)` calls a real change (a task
 * starting or ending) still goes at once. Every update of such a store re-renders at once, which would keep
 * interrupting a page that is still rendering in the background (a page change) if it came every few frames.
 */
function live(topics, read, { pace = 0, urgent } = {}) {
  const on = new Set([topics].flat());
  const pending = [];                 // optimistic changes whose writes have not settled yet, oldest first
  const current = () => pending.reduce((v, patch) => ({ ...v, ...patch }), read());
  let snapshot = copy(current());
  let last = JSON.stringify(snapshot);
  let sentAt = 0, timer = 0;
  const subs = new Set();
  const refresh = (now = false) => {
    const next = current();
    const json = JSON.stringify(next);
    if (json === last) return;
    const since = Date.now() - sentAt;
    if (pace && !now && since < pace && !urgent?.(snapshot, next)) {
      timer ||= setTimeout(() => { timer = 0; refresh(true); }, pace - since);
      return;
    }
    clearTimeout(timer);
    timer = 0;
    sentAt = Date.now();
    last = json;
    snapshot = copy(next);
    for (const fn of subs) fn();
  };
  backend.onChange((t) => { if (on.has(t)) refresh(); });
  return {
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    getSnapshot: () => snapshot,
    /**
     * Show a change at once while its write is on the way. It stays on top of what the backend reports until the
     * returned `settle` is called: after a successful write the backend says the same, after a failed one the value
     * goes back. Quick successive changes never flicker back to an older one.
     */
    optimistic(patch) {
      pending.push(patch);
      refresh();
      return () => { pending.splice(pending.indexOf(patch), 1); refresh(); };
    },
  };
}

// ------------------------------------------------------------------ change notifications
/** Topics: library · viewed (the last viewed file) · tasks · settings · language · access · mcp · snapshots · models · exports ·
 *  index (files' index) · reminder · activity (the activity record: time in Prism, files opened) */
export const events = { subscribe: (fn) => backend.onChange(fn) };

// ------------------------------------------------------------------ gallery
/**
 * A file as pages show it — ref: { id, kind: 'image' | 'video', name, ext, width, height, duration }.
 * A group card: { id, name, createdAt, updatedAt, fileCount, videoCount, bytes, cover: ref | null, covers: [ref], coverAuto,
 *                 palette: { name, colors: [{ name, color }] } | null }
 *   covers: the pictures the card glances through and the group's page opens with, the main cover first (= cover), at
 *   most MAX_COVERS · coverAuto: none were chosen, Prism picks them (the newest picture, then a few from all through
 *   the group) · palette: the colour groups in use
 */
export const library = {
  /** → { groups: [card] (in the user's order), view: { naturalRatio }, stats: { groups, files, bytes, thisWeek },
   *      lastViewed: { file: ref, group: { id, name }, index, total, viewedAt } | null } */
  home: () => call('read', backend.getHome),
  /** → [{ id, name, fileCount, cover }] in the user's order */
  groups: () => call('read', backend.listGroups),
  /** → [{ id, name, color, config, group: { id, name }, fileCount }] */
  colorGroups: () => call('read', backend.listColorGroups),
  /** The pictures a group's covers can be chosen from (newest first), and the covers Prism would pick. → { pictures: [ref], auto: [ref] } */
  groupPictures: (id) => call('read', () => backend.groupPictures(id)),
  createGroup: (input) => call('write', () => backend.createGroup(input)),
  /** patch: any of { name, coverFileIds: [fileId] (pictures of the group, the main cover first) | null (Prism picks them) } */
  updateGroup: (id, patch) => call('write', () => backend.updateGroup(id, patch)),
  /** Deletes the group and every file in it. → { ok, files } */
  deleteGroup: (id) => call('write', () => backend.deleteGroup(id)),
  setGroupOrder: (ids) => call('write', () => backend.setGroupOrder(ids)),
  /** → { file: ref, group: { id, name } } | null */
  randomFile: (excludeId) => call('read', () => backend.randomFile(excludeId)),
  sampleFiles: (n) => call('read', () => backend.sampleFiles(n)),
};

/** Home page settings. Saved optimistically: callers never wait for the write. */
export const homeView = {
  save: (view) => { call('write', () => backend.saveHomeView(view)).catch(() => {}); },
};

// ------------------------------------------------------------------ a group's page
/**
 * A colour-group configuration: { id, name, groups: [{ id, name, color }] } — a group can keep several and gathers
 * its files by one (activeConfigId). A file's `colors` maps a configuration to the colour group it is in there.
 * Page settings (view): { sort: 'created' | 'resolution' | 'size' | 'custom', dir: 'asc' | 'desc', size: 1–5 (10, 8, 6, 4 or
 *   2 tiles across the full width of a row), natural (own proportions, or square), quality, layout: 'single' | 'double' |
 *   'mixed', limited, limit, pageSize (0: all), collapsed: [section key], expanded: [section key], slide (whole seconds
 *   per slide, 1–300), outline (the colour-group outline beside the files is open) } — see domain/arrange.js.
 * Whiteboard settings (board): { layouts: { configuration id (PLAIN_BOARD: no colour groups): { colour group id
 *   (NONE: the files in none): [x, y] } } — where the colour groups were put by hand; a configuration without one is
 *   arranged by Prism —, sizes: { configuration id: { colour group id: { cols, w, h } } } — how many cards across, and
 *   a frame smaller than the cards need (the ones past it hidden), each set by hand —, index (the colour-group index beside the board is open; null: when there are many),
 *   minimap } — see domain/board.js.
 */
export const groupPage = {
  /**
   * Everything a group's page shows; the page asks again every few seconds. `since`: the revision of the copy
   * already held — while nothing changed the answer is just { rev, unchanged: true }.
   * → { rev, group: a group card | null,
   *     configs, activeConfigId, order: [fileId] (the custom order),
   *     files: [ref + { size, createdAt, importedAt, colors, tone: '#rrggbb' (the colour it reads as from afar) | null }],
   *     view, board }
   */
  load: (id, since) => call('read', () => backend.getGroupPage(id, since)),
  /** Saved optimistically: callers never wait for the write. */
  saveView: (id, view) => { call('write', () => backend.saveGroupView(id, view)).catch(() => {}); },
  /** The whiteboard's settings, saved optimistically too. */
  saveBoard: (id, board) => { call('write', () => backend.saveBoard(id, board)).catch(() => {}); },
  PLAIN_BOARD,
  /**
   * Find on the group's whiteboard: files whose name, tags or prompts hold every word, and colour groups (of the
   * configuration in use) whose name does — all of them. → { files: [{ id, matched: ['name' | 'tags' | 'positive' | 'negative'] }], colorGroups: [id] }
   */
  find: (id, text) => call('read', () => backend.findInGroup(id, text)),
  /** One colour group's name or colour. patch: any of { name, color } → { ok, colorGroup } */
  updateColorGroup: (id, configId, colorId, patch) => call('write', () => backend.updateColorGroup(id, configId, colorId, patch)),
  /** input: { name, color, index (last when left out) }; fileIds move into it. → { ok, colorGroup: { id, name, color } } */
  createColorGroup: (id, configId, input, fileIds) => call('write', () => backend.createColorGroup(id, configId, input, fileIds)),
  /** Its files belong to no colour group afterwards. → { ok, colorGroup, index, files: [ids] } (enough to bring it back) */
  removeColorGroup: (id, configId, colorId) => call('write', () => backend.removeColorGroup(id, configId, colorId)),
  /** order: the new custom order of every file; colors: { fileId: colour group id | null } for files changing colour group. */
  place: (id, change) => call('write', () => backend.placeFiles(id, change)),
  /** → { configs, activeConfigId, counts: { colourGroupId: files }, total } */
  colorConfigs: (id) => call('read', () => backend.getColorConfigs(id)),
  /** Save every configuration and use one (new ones carry ids starting with 'new:'). → as colorConfigs */
  saveColorConfigs: (id, input) => call('write', () => backend.saveColorConfigs(id, input)),
  reorderColorGroups: (id, configId, order) => call('write', () => backend.reorderColorGroups(id, configId, order)),
  setActiveConfig: (id, configId) => call('write', () => backend.setActiveConfig(id, configId)),
  /**
   * Pictures and videos from this computer (a FileList or File[]); anything else is left out.
   * → { ok, taskId, accepted, skipped }
   */
  async upload(id, list) {
    const files = [...list];
    const entries = (await Promise.all(files.filter(acceptable).map(probe))).filter(Boolean);
    const skipped = files.length - entries.length;
    if (!entries.length) return { ok: false, accepted: 0, skipped };
    const r = await call('write', () => backend.uploadFiles(id, entries));
    return { ...r, accepted: entries.length, skipped };
  },
};

// ------------------------------------------------------------------ files
/**
 * A file's details: { file: ref, group: { id, name }, config: { id, name, colors } | null, color: { id, name, color } | null,
 *   size, createdAt, importedAt, tags: [{ key, label, source: 'model' | 'user', score }], note,
 *   comfy: { model, seed, positive, negative, sampler, scheduler, steps, cfg, denoise } | null,
 *   cover: { index (0: the main cover), count, auto } | null — where it is among the group's covers }
 */
export const files = {
  detail: (id) => call('read', () => backend.getFileDetail(id)),
  /** patch: any of { userTags: [name], note, color: colour group id | null } → the details */
  update: (id, patch) => call('write', () => backend.updateFile(id, patch)),
  /**
   * What several files carry: → { total, tags: [{ key, label, count, ids (the files with it), source: 'model' | 'user' |
   * 'mixed' }] (on most files first), notes: { written (files with a note), distinct, common (the one note all share) | null } }
   */
  summary: (ids) => call('read', () => backend.filesSummary(ids)),
  /**
   * Tags for several files at once. add: [label] — files already showing it are left as they are; remove: [key] —
   * gone from every file showing it, whoever gave it (the tagger's tags stay away when re-indexing).
   * → { ok, changed: [fileId] } (the inverse edit on these undoes it)
   */
  editTags: (ids, change) => call('write', () => backend.editFileTags(ids, change)),
  /** notes: { fileId: note }, each replacing the one there. → { ok, previous: { fileId: note } } (setting those undoes it) */
  setNotes: (notes) => call('write', () => backend.setFileNotes(notes)),
  /** Moved to the system's recycle bin. → { ok, count } */
  remove: (ids) => call('write', () => backend.deleteFiles(ids)),
  /** Undo a deletion moments later. → { ok, count } */
  restore: (ids) => call('write', () => backend.restoreFiles(ids)),
  /**
   * kinds: any of 'tagging' (the user's own tags stay), 'embedding', 'metadata'.
   * → { ok, taskId } | { ok: false, error: 'modelMissing' (no tagging model) | 'imageModelMissing' }
   */
  reindex: (ids, kinds) => call('write', () => indexBackend.reindexFiles({ ids, kinds })),
  /**
   * Named with the download pattern from Settings. One file is handed over at once → { ok, file: { url, name } }
   * (url: revoke once saved); several are packed by a task → { ok, taskId, count }.
   */
  async download(ids) {
    const r = await call('write', () => backend.downloadFiles(ids));
    if (!r.ok || !r.file) return r;
    return { ok: true, file: { name: r.file.name, url: await renderDownload(r.file) } };
  },
  /** The file being looked at (the home page's "last viewed"). Fire and forget. */
  viewed: (id) => { call('write', () => backend.markViewed(id)).catch(() => {}); },
};

/** The browsing order of a group's page — the rules live in domain/arrange.js. */
export const browsing = { arrange, placeBatch, pageOf, pageOfSection, NONE, DEFAULT_VIEW, SORTS, QUALITY_LEVELS, LAYOUTS, PAGE_SIZES, SIZE_LEVELS, SLIDE_RANGE, SLIDE_SECONDS };
/** Putting a configuration's colour groups in order (move several together, a step at a time, sort all) — domain/colorOrder.js. */
export const colorOrder = { moveTogether, stepTogether, sortColorGroups, findInName, COLOR_SORTS };
/** A group's covers: Prism's own picks, and the edits (add, remove, main, toggle, move) — data/domain/covers.js. */
export const covers = { ...coverEdits, auto: autoCovers, MAX: MAX_COVERS };

// ------------------------------------------------------------------ media
export const media = {
  QUALITIES: Object.keys(QUALITIES),
  /** The address of a file's picture at a quality ('original' | 'high' | 'medium' | 'low'); a video gives its poster. */
  url: (ref, quality = 'original') => backend.mediaUrl(ref, quality),
  /** The address of a video's stream. */
  stream: (ref) => backend.streamUrl(ref),
};

// ------------------------------------------------------------------ search
/** The colour a picture reads as from afar: the average of a tiny copy of it. */
async function toneOf(blob) {
  const bmp = await createImageBitmap(blob, { resizeWidth: 16, resizeHeight: 16 });
  const cv = new OffscreenCanvas(16, 16);
  const ctx = cv.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const px = ctx.getImageData(0, 0, 16, 16).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) { sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; }
  return sum.map((v) => Math.round(v / 256));
}

export const search = {
  /** → { semantic: { available, reason }, similar: { available, reason } }  (reason: 'noIndex' while there is no image index) */
  capabilities: () => call('read', backend.searchCapabilities),
  /**
   * input: { text, domains: { tags, positive, negative, semantic, similar, groups: [id], colorGroups: [id] }, image: token }
   * → { total, terms, groups: [{ id, name, fileCount, cover, ranges }], colorGroups: [{ id, name, color, config (its configuration's name), configId, group, fileCount, ranges }],
   *     files: [{ file: ref, group, matched: ['tags' | 'positive' | 'negative' | 'semantic' | 'similar'], tag, prompt, similarity }] }
   */
  query: (input) => call('read', () => backend.search(input)),
  /**
   * A picture to look for similar ones with: a File from this computer, or one of the gallery's files (a ref).
   * → { token, url, name }
   */
  async queryImage(source) {
    if (source instanceof Blob) {
      const tone = await toneOf(source).catch(() => [128, 128, 128]);
      return { token: backend.registerQueryImage({ tone }), url: URL.createObjectURL(source), name: source.name ?? '' };
    }
    return { token: backend.registerQueryImage({ fileId: source.id }), url: backend.mediaUrl(source, 'low'), name: source.name };
  },
};

// ------------------------------------------------------------------ tags
export const tags = {
  /** → { tags: [{ key, label, count, user, source: 'model' | 'user' }] (most used first), files } */
  index: () => call('read', backend.getTagIndex),
  /** → [{ file: ref, group }] */
  samples: (key, n = 6) => call('read', () => backend.tagSamples(key, n)),
};

// ------------------------------------------------------------------ tasks
/**
 * Live: [{ id, type: 'import' | 'upload' | 'index' | 'reindex' | 'export' | 'model-download' | 'download' | 'snapshot' | 'snapshot-export' | 'snapshot-import',
 *          state: 'queued' | 'running' | 'done' | 'failed' | 'canceled', stage, processed, total, unit: 'files' | 'bytes', kinds, label,
 *          origin (an index task: 'waiting' | 'upload' | 'auto' | null), group: { id, name } | null, groups: [{ id, name }], result, error,
 *          createdAt, startedAt, finishedAt }]
 * An index task builds its kinds one after another: `stage` is the kind under way, processed / total count its files.
 */
const PROGRESS_PACE = 500;
export const tasks = {
  ...live('tasks', backend.getTasks, {
    pace: PROGRESS_PACE,
    urgent: (a, b) => a.length !== b.length || a.some((x, i) => x.id !== b[i].id || x.state !== b[i].state),
  }),
  clearHistory: () => call('write', backend.clearTaskHistory),
  cancel: (id) => call('write', () => backend.cancelTask(id)),
};

// ------------------------------------------------------------------ export
/**
 * A template: [{ type: 'text', text } | { type: 'key', kind: 'agg' | 'data', id }] — see domain/filename.js.
 * An export configuration: { groupIds, outputDir, dates: { mode: 'all' } | { mode: 'range', from, to }, fileTypes, template }
 *   (dates are the files' import dates).
 */
export const exporter = {
  /**
   * scope: 'home' | 'group' → { groups: [{ id, name, fileCount, cover }], fileTypes: [{ ext, count, kind }],
   *   keys: { agg: [{ id, label, keys: [{ id, label }] }], data: [...] }, calendar: { 'YYYY-MM-DD': files imported that day } }
   */
  options: (query) => call('read', () => backend.getExportOptions(query)),
  /** The key catalog alone (for templates outside the export sheet). */
  catalog: () => call('read', backend.getKeyCatalog),
  /** → { root: { name, path, count, bytes, dirs, files: [{ name, size, kind }], hidden }, files, bytes, dirs } */
  preview: (config, opts) => call('read', () => backend.previewExport(config, opts)),
  /** → { taskId, files } */
  start: (config) => call('write', () => backend.startExport(config)),
  /** The last configuration of a page ('home' or 'group:<id>'), or null. */
  lastConfig: (scope) => call('read', () => backend.getLastExportConfig(scope)),
  saveConfig: (scope, config) => { call('write', () => backend.saveLastExportConfig(scope, config)).catch(() => {}); },
  /** How a download template names a few real files. → [{ file: ref, original, name }] */
  namePreview: (template) => call('read', () => backend.namePreview(template)),
  /** Free text typed into a template, without the characters a file name cannot hold (and, for `pathless`, no folders). */
  filterText: (text, opts) => stripIllegal(text, opts),
  /** → [{ code }] — see domain/filename.js */
  validate: (template) => validateTemplate(template),
};

// ------------------------------------------------------------------ folders (for the folder picker)
export const folders = {
  /** → { drives: [{ name, path }], places: [{ id, path }] } */
  roots: () => call('read', backend.fsRoots),
  /** → { ok, path, parent, entries: [{ name, path, library }], files: [{ name, path, size, modifiedAt }] } — files only with opts.accept */
  list: (path, opts) => call('read', () => backend.fsList(path, opts)),
  create: (dir, name) => call('write', () => backend.fsCreateFolder(dir, name)),
};

// ------------------------------------------------------------------ settings
/**
 * Live: { language, theme, dbPath, defaultDbPath, conflict: 'keep' | 'skip' | 'overwrite', gpu, whiteboard: 'auto' | 'webgl' | 'dom',
 *         downloadName: template,
 *         indexing: { upload: { on, kinds: [kind] }, auto: { on, backlog: { on, count, remind, background }, age: { on, hours, remind, background } } }
 *       } (config.toml) — indexing: see domain/indexing.js (DEFAULT_INDEXING); it is always given whole.
 */
const settingsStore = live('settings', backend.getSettings);
/** Preferences the UI shows changed at once. A new database folder waits for the backend: it reloads the gallery. */
const INSTANT = new Set(['language', 'theme', 'conflict', 'gpu', 'whiteboard', 'downloadName', 'indexing']);
export const settings = {
  subscribe: settingsStore.subscribe,
  getSnapshot: settingsStore.getSnapshot,
  /** Applied at once (optimistically) and saved in the background; a failed save puts the old value back. */
  async update(patch) {
    const instant = Object.fromEntries(Object.entries(patch).filter(([k]) => INSTANT.has(k)));
    const settle = Object.keys(instant).length ? settingsStore.optimistic(instant) : () => {};
    try { return await call('write', () => backend.updateSettings(patch)); } finally { settle(); }
  },
};

// ------------------------------------------------------------------ models (tagging, image index)
/**
 * Live: { gpu: { name } | null, list: [{ id, kind: 'tagging' | 'embedding' (the image index), name, size,
 *         state: 'missing' | 'downloading' | 'ready', inUse, progress: { stage, processed, total, queued } | null, taskId }] }
 * One model of each kind is in use at a time; using another makes what the one before built outdated.
 */
export const models = {
  ...live(['models', 'tasks'], indexBackend.getModels, {
    pace: PROGRESS_PACE,
    urgent: (a, b) => a.list.some((m, i) => m.state !== b.list[i]?.state || m.inUse !== b.list[i]?.inUse),
  }),
  download: (id) => call('write', () => indexBackend.downloadModel(id)),
  /** Delete the model's files, then download it again. */
  redownload: (id) => call('write', () => indexBackend.redownloadModel(id)),
  /** → { ok, previous: the model in use before (to undo) } */
  use: (id) => call('write', () => indexBackend.useModel(id)),
  cancel: (taskId) => call('write', () => backend.cancelTask(taskId)),
};

// ------------------------------------------------------------------ the index (tags, image index, metadata of every file)
/**
 * A file's index of a kind is done · stale · missing · failed · queued · off — the backend says which (domain/indexing.js).
 * Live: { total, waiting (files with something still to build), needs (files not up to date, those being built too), lastIndexedAt,
 *         kinds: { tagging | embedding | metadata: { available (something builds it), model: { id, name } | null, done, stale, missing, failed, queued } },
 *         active: the index task under way { id, type, state, stage (the kind it builds), processed, total, kinds, files, origin, groups: [name] } | null,
 *         tasks (index tasks running or waiting), groups: [{ id, name, cover, total, waiting, needs, kinds: { kind: counts } }] }
 */
export const indexing = {
  KINDS: INDEX_KINDS,
  /** How the rules remind (for showing them): the step of the waiting-files rule, the time rule's day, the bounds of their numbers. */
  rules: { remindStep, nextReminderAt, ageEvery: AGE_REMIND_EVERY_H, limits: RULE_LIMITS },
  // (not 'tasks': every step of every task would recompute it — an index task announces its own changes as 'index')
  ...live(['index', 'library', 'models'], indexBackend.getIndexOverview, {
    pace: PROGRESS_PACE,
    urgent: (a, b) => a.active?.id !== b.active?.id || a.active?.stage !== b.active?.stage || !a.waiting !== !b.waiting
      || INDEX_KINDS.some((k) => a.kinds[k].available !== b.kinds[k].available),
  }),
  /**
   * query: { groupId (null: every group), show: 'needs' | 'all', kind, state (with kind: a state, or 'needs'), text }
   * → { rows: [ref + { groupId, states: { kind: state }, needs: [kind], at }] } (groups in the gallery's order, newest first)
   */
  files: (query) => call('read', () => indexBackend.getIndexFiles(query)),
  /** The waiting files of a group. → { ids } */
  waitingIn: (groupId) => call('read', () => indexBackend.waitingIn(groupId)),
  /** How many of these files still need each kind built. → { tagging, embedding, metadata } */
  needs: (ids) => call('read', () => indexBackend.indexNeeds(ids)),
  /** Index the waiting files (of a group, or all), each with what it still needs. → { ok, taskId, files } */
  indexWaiting: (opts) => call('write', () => indexBackend.indexWaiting(opts)),
};

// ------------------------------------------------------------------ statistics
/**
 * The statistics page: what the database folder is made of, every group's and colour group's share, the files by size
 * and type, and the activity record. The record is the only data kept for this page alone — one row a day: seconds in
 * Prism, files opened, files added and removed, and the gallery's files and bytes at the end of the day (the backend
 * fills it in as things happen, and backfills days from before it existed from the files' import dates). The rest is
 * worked out from what the database holds already. See domain/stats.js for the buckets, types and day arithmetic.
 *
 * A scope: { groupId (null: the whole gallery), configId (the configuration a group is split by; its own by default),
 *   colorId (a colour group of it; NONE: its files in no colour group) }.
 */
export const stats = {
  PARTS: STORAGE_PARTS,
  BUCKETS: SIZE_BUCKETS,
  TYPES: [...FILE_TYPES, OTHER_TYPE],
  METRICS: ACTIVITY_METRICS,
  RANGES: ACTIVITY_RANGES,
  DEFAULT_RANGE,
  NONE,
  /** The arithmetic the page draws with (pure). */
  rules: { typeOf, dayOf, addDays, daysBetween, weekdayOf, streaks, movingAverage, metricOf, usedOn },
  /**
   * → { path, total, parts: [{ id: 'files' | 'previews' | 'database' | 'index' | 'snapshots', bytes }],
   *     drive: { name, total, free } (the drive the folder is on), files, videos, groups,
   *     growth: { days: 30, files, bytes } (how the gallery's files changed over those days) }
   */
  storage: () => call('read', statsBackend.getStorage),
  /**
   * scope → { scope: { kind: 'all' | 'group' | 'color', group: { id, name, cover } | null, config: { id, name } | null,
   *             color: { id, name, color } | null } (where it points, made good: a group gone is the whole gallery),
   *   bytes, files, images, videos, median, mean (file sizes), share: { bytes (the whole it is part of) } | null,
   *   configs: [{ id, name, colorGroups, active }] (a group's),
   *   children: the whole gallery — its groups [{ id, kind: 'group', name, cover, bytes, files, videos, config, colorGroups,
   *               configs, parts: [{ id, kind: 'color' | 'none', name, color, bytes, files }] (the configuration in use) }];
   *             a group — its colour groups [{ id, kind: 'color' | 'none', name, color, bytes, files, videos, types }]; a colour group — [],
   *   types: [{ type, kind: 'image' | 'video' | null, files, bytes }],
   *   buckets: [{ id, min, max (null: no limit), files, bytes, types: { type: { files, bytes } } }],
   *   tiles: [ref + { size, groupId }] (the largest files, where there is nothing more to split), rest: { files, bytes } }
   */
  scope: (scope) => call('read', () => statsBackend.getScope(scope)),
  /**
   * A scope's files, the largest first: scope + { bucket (a BUCKETS id), type (one of TYPES), limit }.
   * → { total, bytes, rows: [ref + { size, groupId, group (its name), color: { id, name, color } | null, importedAt }] }
   */
  files: (query) => call('read', () => statsBackend.getScopeFiles(query)),
  /**
   * → { first, today, days: [{ day, seconds, opened, added, removed, files, bytes }] (every day from the first, oldest first),
   *     streak: { current, longest, longestEnd }, snapshots: [{ id, name, at }] }
   */
  activity: () => call('read', statsBackend.getActivity),
  /**
   * One day: → { day, record, groups: [{ id, name, cover, count, bytes, files: [ref] }] (the files added that day that are
   * still here, by group), kept (how many of those), snapshots: [{ id, name, at }] (taken that day) }
   */
  day: (day) => call('read', () => statsBackend.getDay(day)),
  /** Time spent in Prism since the last call (the page reports it about once a minute while in use). Fire and forget. */
  present: (seconds) => { call('write', () => statsBackend.present(seconds)).catch(() => {}); },
};

/**
 * Live: the reminder of automatic indexing showing now — { id, rule: 'backlog' | 'age', waiting, hours (since the last
 * indexing), started (files a background run took, 0: none), at } | null.
 */
export const reminders = {
  ...live(['reminder', 'library'], indexBackend.getReminder),
  /** Seen or put off. `mute`: not again (the rules stop reminding). → { ok, was: { backlog, age } } */
  dismiss: (id, opts) => call('write', () => indexBackend.dismissReminder(id, opts)),
};

// ------------------------------------------------------------------ access: sign-in, server mode, MCP service, first run
/**
 * Live: { locked, firstRun, password: { enabled, changedAt, minLength },
 *         server: { enabled, running, port, addresses: [{ id, kind, name, ip, url }] },
 *         mcp: { enabled, endpoint, keys, lastUsedAt } }
 * Server mode is read when the service starts: `enabled` is the saved choice, `running` what is in effect now.
 */
export const access = {
  ...live('access', accessBackend.getAccess),
  /** → { ok } | { ok: false, retryIn? } */
  login: (password) => call('auth', () => accessBackend.login(password)),
  lock: () => call('write', accessBackend.lock),
  /** Turn password login on (current omitted) or change it. → { ok } | { ok: false, error: 'wrong' | 'tooShort' } */
  setPassword: (input) => call('auth', () => accessBackend.setPassword(input)),
  disablePassword: (current) => call('auth', () => accessBackend.disablePassword(current)),
  setServer: (enabled) => call('write', () => accessBackend.setServer(enabled)),
  setMcp: (enabled) => call('write', () => accessBackend.setMcp(enabled)),
  /** First launch: { password?: string, server: bool, mcp: bool } */
  completeSetup: (choices) => call('write', () => accessBackend.completeSetup(choices)),
};

// ------------------------------------------------------------------ MCP keys
/**
 * key: { id, name, last4, createdAt, lastUsedAt, scope: { groupIds, future },
 *        permissions: { group: { query, edit, delete }, colorGroup: { query, create, edit, delete }, file: { query, create, edit, delete } } }
 * The full secret is only returned by create and regenerate.
 */
export const mcp = {
  PERMISSIONS: accessBackend.PERMISSIONS,
  keys: () => call('read', accessBackend.listKeys),
  /** → { ok, key, secret } */
  create: (input) => call('write', () => accessBackend.createKey(input)),
  update: (id, input) => call('write', () => accessBackend.updateKey(id, input)),
  remove: (id) => call('write', () => accessBackend.deleteKey(id)),
  /** → { ok, key, secret } */
  regenerate: (id) => call('write', () => accessBackend.regenerateKey(id)),
  /** The settings an MCP client needs to connect with a key (MCP over HTTP, bearer token), ready to paste. */
  clientConfig: (endpoint, secret) => JSON.stringify({
    mcpServers: { prism: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${secret}` } } },
  }, null, 2),
};

// ------------------------------------------------------------------ snapshots (data backup)
/**
 * overview → { dbPath, storage (bytes, the whole history), head, busy, current: { groups, files },
 *              pending: { total, added, modified, deleted, files, groups: [{ id, name, cover, changes, removed }], shared },
 *              snapshots: [{ id, name, createdAt, source: 'created' | 'imported', totals: { groups, files }, changes, previews: [ref] }] (oldest first) }
 * changes(id | 'working') → { base, summary, groups: [{ kind: 'group' | 'file' | 'settings', change, count, items }],
 *                             files: { total, items: [{ path, change }] } }
 */
export const backup = {
  overview: () => call('read', snapshotBackend.getBackup),
  changes: (id) => call('read', () => snapshotBackend.getChanges(id)),
  /** groupIds: whose changes the snapshot saves (required). */
  create: (name, groupIds) => call('write', () => snapshotBackend.createSnapshot(name, groupIds)),
  load: (id, opts) => call('heavy', () => snapshotBackend.loadSnapshot(id, opts)),
  remove: (id) => call('write', () => snapshotBackend.hideSnapshot(id)),
  restore: (id) => call('write', () => snapshotBackend.unhideSnapshot(id)),
  exportTo: (input) => call('write', () => snapshotBackend.exportSnapshots(input)),
  inspect: (path) => call('read', () => snapshotBackend.inspectArchive(path)),
  importFrom: (path) => call('write', () => snapshotBackend.importArchive(path)),
};

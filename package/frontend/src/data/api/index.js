// The data layer's public API. The UI never talks to the backend directly: it goes through the bridge hooks,
// which call these functions. Today they are served by the in-memory mock backend (mock/backend.js); replacing it
// with an HTTP/SSE client against the Go service keeps this surface unchanged.
import * as backend from '../mock/backend.js';
import { QUALITIES } from '../domain/files.js';

const LATENCY = { read: [80, 200], write: [160, 320] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = ([a, b]) => a + Math.random() * (b - a);
const copy = (v) => (v == null ? v : structuredClone(v));

async function call(kind, fn) {
  await wait(jitter(LATENCY[kind]));
  return copy(fn());
}

/** A pushed value (tasks, settings): subscribe + current snapshot, for useSyncExternalStore. */
function live(topic, read) {
  let snapshot = copy(read());
  const subs = new Set();
  backend.onChange((t) => {
    if (t !== topic) return;
    snapshot = copy(read());
    for (const fn of subs) fn();
  });
  return {
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    getSnapshot: () => snapshot,
  };
}

// ------------------------------------------------------------------ change notifications
/** Topics: library · tasks · settings */
export const events = { subscribe: (fn) => backend.onChange(fn) };

// ------------------------------------------------------------------ gallery
/**
 * A file as pages show it — ref: { id, kind: 'image' | 'video', name, ext, width, height, duration }.
 * A group card: { id, name, createdAt, updatedAt, fileCount, videoCount, bytes, cover: ref | null, coverAuto, previews: [ref],
 *                 palette: { name, colors: [{ name, color }] } | null }
 *   coverAuto: no cover was chosen, the newest picture stands in · palette: the colour groups in use
 */
export const library = {
  /** → { groups: [card] (in the user's order), view: { naturalRatio }, stats: { groups, files, bytes, thisWeek },
   *      lastViewed: { file: ref, group: { id, name }, index, total, viewedAt } | null } */
  home: () => call('read', backend.getHome),
  /** → [{ id, name, fileCount, cover }] */
  groups: () => call('read', backend.listGroups),
  /** → [{ id, name, color, config, group: { id, name }, fileCount }] */
  colorGroups: () => call('read', backend.listColorGroups),
  group: (id) => call('read', () => backend.getGroup(id)),
  /** The pictures a group's cover can be chosen from. → [ref] */
  groupPictures: (id) => call('read', () => backend.groupPictures(id)),
  createGroup: (input) => call('write', () => backend.createGroup(input)),
  /** patch: any of { name, coverFileId } (coverFileId null: automatic) */
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
   * → { total, terms, groups: [{ id, name, fileCount, cover, ranges }], colorGroups: [{ id, name, color, config, group, fileCount, ranges }],
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
 * Live: [{ id, type: 'import' | 'reindex' | 'export' | 'model-download' | 'download', state: 'queued' | 'running' | 'done' |
 *          'failed' | 'canceled', stage, processed, total, unit: 'files' | 'bytes', kinds, label, group, result, error,
 *          createdAt, startedAt, finishedAt }]
 */
export const tasks = {
  ...live('tasks', backend.getTasks),
  clearHistory: () => call('write', backend.clearTaskHistory),
  cancel: (id) => call('write', () => backend.cancelTask(id)),
};

// ------------------------------------------------------------------ settings
/** Live: { language, theme, dbPath, defaultDbPath } (config.toml) */
export const settings = {
  ...live('settings', backend.getSettings),
  update: (patch) => call('write', () => backend.updateSettings(patch)),
};

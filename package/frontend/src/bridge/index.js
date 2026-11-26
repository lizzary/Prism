// The bridge: React hooks and actions over the data layer. UI components import from here and nowhere else.
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import * as api from '../data/api/index.js';
import { useQuery, useSuspenseQuery, useDebounced, prefetch, preloadSuspense } from './query.js';
import { feedOf, refreshFeeds, useFeed, REFRESH_MS } from './feed.js';

export { useDebounced, REFRESH_MS };
export const FILE_KINDS = api.FILE_KINDS;
/** What a write elsewhere changed is on the group's page at once (instead of at its next look). */
const thenRefresh = (fn) => async (...args) => { const r = await fn(...args); refreshFeeds(); return r; };

/** Queries that several views share, and that can be loaded ahead of the view that shows them. */
const Q = {
  home: ['home', api.library.home, ['library', 'viewed']],
  groups: ['groups', api.library.groups, ['library']],
  colorGroups: ['color-groups', api.library.colorGroups, ['library']],
  capabilities: ['search-capabilities', api.search.capabilities, ['library']],
  tagIndex: ['tag-index', api.tags.index, ['library']],
  backup: ['backup', api.backup.overview, ['snapshots', 'library']],
  mcpKeys: ['mcp-keys', api.mcp.keys, ['mcp']],
  keyCatalog: ['key-catalog', api.exporter.catalog, []],
};

// ------------------------------------------------------------------ gallery
// Page data suspends (see useSuspenseQuery); smaller pieces load in place.
export const useHome = () => useSuspenseQuery(...Q.home);
/** Start loading the home page before it is shown (after signing in), so it opens without a placeholder. */
export const preloadHome = () => preloadSuspense(...Q.home);
export const useGroupList = () => useQuery(...Q.groups);
export const useColorGroupList = () => useQuery(...Q.colorGroups);
/** The pictures a group's covers can be chosen from, and Prism's own picks: { pictures, auto }. */
export const useGroupPictures = (id) => useQuery(id ? `group-pictures:${id}` : null, () => api.library.groupPictures(id), ['library']);
/** A group's covers: MAX, Prism's own picks (auto) and the edits a list of covers goes through — see data/domain/covers.js. */
export const coverRules = api.covers;

export const libraryActions = {
  createGroup: api.library.createGroup,
  updateGroup: thenRefresh(api.library.updateGroup),
  deleteGroup: thenRefresh(api.library.deleteGroup),
  setGroupOrder: api.library.setGroupOrder,
  randomFile: api.library.randomFile,
  sampleFiles: api.library.sampleFiles,
  saveHomeView: api.homeView.save,
};

// ------------------------------------------------------------------ a group's page
/** The browsing order (sort, colour groups, limits, pages) and its settings — see data/domain/arrange.js. */
export const browsing = api.browsing;
/** Putting colour groups in order: move several together, a step at a time, sort all at once — data/domain/colorOrder.js. */
export const colorOrder = api.colorOrder;
/**
 * A group's page, kept fresh by asking again every few seconds (see feed.js). Suspends until the first answer.
 * → { data: { rev, group, configs, activeConfigId, order, files, view }, clock, arrived }
 */
export const useGroupPage = useFeed;
/** Start loading a group's page before it is shown (one of its files is about to be opened from elsewhere). → its data */
export const preloadGroupPage = (id) => feedOf(id).load();
/** Rest the page's refresh clock while a drag is under way. → release */
export const holdGroupPage = (id) => feedOf(id).hold();
export const refreshGroupPage = (id) => feedOf(id).refresh();

const ref = (f) => ({ id: f.id, kind: f.kind, name: f.name, ext: f.ext, width: f.width, height: f.height, duration: f.duration });
const withColor = (colors, configId, colorId) => {
  const next = { ...colors };
  if (colorId) next[configId] = colorId; else delete next[configId];
  return next;
};
/** The page with `ids` as the group's covers (null: Prism picks them), the way the data layer will answer. */
const withCovers = (d, ids) => {
  const byId = new Map(d.files.map((f) => [f.id, f]));
  const chosen = (ids ?? []).map((x) => byId.get(x)).filter(Boolean);
  const covers = (chosen.length ? chosen : api.covers.auto(d.files)).map(ref);
  return { ...d, group: { ...d.group, covers, cover: covers[0] ?? null, coverAuto: !chosen.length } };
};
const without = (d, gone) => {
  const files = d.files.filter((f) => !gone.has(f.id));
  const left = d.files.filter((f) => gone.has(f.id));
  if (!d.group) return { ...d, files };
  const next = {
    ...d, files,
    group: {
      ...d.group, fileCount: files.length,
      bytes: d.group.bytes - left.reduce((n, f) => n + f.size, 0),
      videoCount: d.group.videoCount - left.filter((f) => f.kind === 'video').length,
    },
  };
  // a deleted cover leaves the covers (and Prism's own picks are picked again)
  return withCovers(next, d.group.coverAuto ? null : d.group.covers.map((c) => c.id).filter((x) => !gone.has(x)));
};
/**
 * Edit a group's covers, starting from the ones its page shows now. Answers at once (the change shows at once too,
 * while it is written): → { ok, full (no room for another) }
 */
const editCovers = (id, edit) => {
  const d = feedOf(id).getSnapshot().data;
  if (!d?.group) return { ok: false };
  const next = edit(d.group.covers.map((c) => c.id));
  if (!next) return { ok: false, full: true };
  groupActions.setCovers(id, next.length ? next : null).catch(() => {});
  return { ok: true };
};

/** Changes to a group's files and colour groups. Those made on the page show at once (optimistically). */
export const groupActions = {
  /** Page settings are saved in the background; the page keeps its own copy meanwhile (useOptimisticView). */
  saveView: api.groupPage.saveView,
  /** order: the new custom order; colors: { fileId: colour group id | null } (in the configuration in use). */
  place: (id, { order, colors }) => feedOf(id).change(
    (d) => ({
      ...d, order: order ?? d.order,
      files: colors ? d.files.map((f) => (f.id in colors ? { ...f, colors: withColor(f.colors, d.activeConfigId, colors[f.id]) } : f)) : d.files,
    }),
    () => api.groupPage.place(id, { order, colors }),
  ),
  remove: (id, ids) => feedOf(id).change((d) => without(d, new Set(ids)), () => api.files.remove(ids)),
  restore: thenRefresh(api.files.restore),
  /** ids: the covers, the main one first; null: Prism picks them. */
  setCovers: (id, ids) => feedOf(id).change((d) => withCovers(d, ids), () => api.library.updateGroup(id, { coverFileIds: ids })),
  /** A picture joins the covers at the end. → { ok, full } */
  addCover: (id, fileId) => editCovers(id, (ids) => api.covers.add(ids, fileId)),
  /** A picture becomes the main cover (joining the covers if it was not one). → { ok } */
  mainCover: (id, fileId) => editCovers(id, (ids) => api.covers.main(ids, fileId)),
  removeCover: (id, fileId) => editCovers(id, (ids) => api.covers.remove(ids, fileId)),
  setActiveConfig: (id, configId) => feedOf(id).change((d) => ({ ...d, activeConfigId: configId }), () => api.groupPage.setActiveConfig(id, configId)),
  reorderColorGroups: (id, configId, order) => feedOf(id).change(
    (d) => {
      const at = new Map(order.map((x, i) => [x, i]));
      return { ...d, configs: d.configs.map((c) => (c.id !== configId ? c : { ...c, groups: [...c.groups].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9)) })) };
    },
    () => api.groupPage.reorderColorGroups(id, configId, order),
  ),
  saveColorConfigs: thenRefresh(api.groupPage.saveColorConfigs),
  upload: api.groupPage.upload,
  /** The whiteboard's settings (where colour groups were put, its panels): saved in the background, as page settings are. */
  saveBoard: api.groupPage.saveBoard,
  /** A colour group's name or colour, shown at once. patch: any of { name, color } */
  updateColorGroup: (id, configId, colorId, patch) => feedOf(id).change(
    (d) => ({ ...d, configs: d.configs.map((c) => (c.id !== configId ? c : { ...c, groups: c.groups.map((x) => (x.id === colorId ? { ...x, ...patch } : x)) })) }),
    () => api.groupPage.updateColorGroup(id, configId, colorId, patch),
  ),
  /** → { ok, colorGroup } once the page has it (a new colour group's id comes from the data layer). */
  createColorGroup: (id, configId, input, fileIds) => feedOf(id).change((d) => d, () => api.groupPage.createColorGroup(id, configId, input, fileIds)),
  /** Gone at once; its files belong to no colour group. → { ok, colorGroup, index, files } (enough to bring it back) */
  removeColorGroup: (id, configId, colorId) => feedOf(id).change(
    (d) => ({
      ...d,
      configs: d.configs.map((c) => (c.id !== configId ? c : { ...c, groups: c.groups.filter((x) => x.id !== colorId) })),
      files: d.files.map((f) => (f.colors?.[configId] !== colorId ? f : { ...f, colors: withColor(f.colors, configId, null) })),
    }),
    () => api.groupPage.removeColorGroup(id, configId, colorId),
  ),
};
export const useColorConfigs = (id) => useQuery(id ? `color-configs:${id}` : null, () => api.groupPage.colorConfigs(id), ['library']);
/** The layout key of a whiteboard whose group uses no colour groups. */
export const PLAIN_BOARD = api.groupPage.PLAIN_BOARD;
/** Find on a group's whiteboard as the words are typed. → { data: { files: [{ id, matched }], colorGroups: [id] }, loading, settled } */
export function useBoardFind(groupId, text) {
  const q = useDebounced(text.trim(), 140);
  const res = useQuery(q ? `board-find:${groupId}:${q}` : null, () => api.groupPage.find(groupId, q), ['library']);
  return { ...res, settled: q || null };
}

// ------------------------------------------------------------------ files
export const useFileDetail = (id) => useQuery(id ? `file:${id}` : null, () => api.files.detail(id), ['library']);
/** What several files carry (their tags, their notes) — see data/api files.summary. Pass null to skip. */
export function useFilesSummary(ids) {
  const key = ids?.length ? `files-summary:${[...ids].sort().join(',')}` : null;
  const res = useQuery(key, () => api.files.summary(ids).then((d) => ({ ...d, key })), ['library']);
  return { ...res, data: res.data?.key === key ? res.data : undefined };
}
export const fileActions = {
  update: thenRefresh(api.files.update),
  /** Tags for several files: { add: [label], remove: [key] } → { ok, changed } */
  editTags: thenRefresh(api.files.editTags),
  /** { fileId: note } → { ok, previous } */
  setNotes: thenRefresh(api.files.setNotes),
  remove: thenRefresh(api.files.remove),
  reindex: api.files.reindex,
  download: api.files.download,
  viewed: api.files.viewed,
};

// ------------------------------------------------------------------ media
/** The address of a file's picture at a quality ('original' | 'high' | 'medium' | 'low'). */
export const mediaUrl = api.media.url;
export const streamUrl = api.media.stream;

// ------------------------------------------------------------------ search
const EMPTY_RESULT = { groups: [], colorGroups: [], files: [], total: 0, terms: [] };
export function useSearch(text, domains, image) {
  const q = useDebounced(text.trim(), 160);
  const ready = !!q || !!(image && domains.similar);
  const key = ready ? `search:${q}:${image ?? ''}:${JSON.stringify(domains)}` : null;
  const res = useQuery(key, () => api.search.query({ text: q, domains, image }), ['library']);
  return { ...res, data: (ready && res.data) || EMPTY_RESULT, settled: ready ? { text: q, image } : null };
}
export const useSearchCapabilities = () => useQuery(...Q.capabilities);
export const searchActions = { queryImage: api.search.queryImage };
/** What the search palette shows as soon as it opens: where it can look, and whether the image index is there. */
export const prefetchSearch = () => { prefetch(...Q.capabilities); prefetch(...Q.groups); prefetch(...Q.colorGroups); };

// ------------------------------------------------------------------ tags
export const useTagIndex = () => useQuery(...Q.tagIndex);
export const prefetchTagIndex = () => prefetch(...Q.tagIndex);
export const useTagSamples = (key) => useQuery(key ? `tag-samples:${key}` : null, () => api.tags.samples(key, 6), ['library']);

// ------------------------------------------------------------------ live stores
const useLive = (store) => useSyncExternalStore(store.subscribe, store.getSnapshot);

export const useTasks = () => useLive(api.tasks);
export const taskActions = { clearHistory: api.tasks.clearHistory, cancel: api.tasks.cancel };

export const useSettings = () => useLive(api.settings);
/** One setting: the component re-renders only when that one changes (the app shell reads theme and language this way). */
export const useSetting = (key) => useSyncExternalStore(api.settings.subscribe, () => api.settings.getSnapshot()[key]);
/** Changes show at once and are saved in the background (see data/api: settings.update). */
export const settingsActions = { update: async (patch) => { const r = await api.settings.update(patch); if ('dbPath' in patch) refreshFeeds(); return r; } };
export const folderActions = { roots: api.folders.roots, list: api.folders.list, create: api.folders.create };

export const useModels = () => useLive(api.models);
export const modelActions = {
  download: api.models.download, redownload: api.models.redownload, cancel: api.models.cancel,
  /** → { ok, previous } (the model in use before, to undo) */
  use: api.models.use,
};

// ------------------------------------------------------------------ the index (tags, image index, metadata)
export const INDEX_KINDS = api.indexing.KINDS;
/** How the rules of automatic indexing remind (to show them): remindStep(count), nextReminderAt(waiting, count), ageEvery, limits. */
export const indexRules = api.indexing.rules;
/** The whole gallery's index (see data/api: indexing), live. */
export const useIndexOverview = () => useLive(api.indexing);
/** Files waiting to be indexed (of one group, or of the gallery): re-renders only when that number changes. */
export function useIndexWaiting(groupId) {
  return useSyncExternalStore(api.indexing.subscribe, () => {
    const o = api.indexing.getSnapshot();
    return groupId ? o.groups.find((g) => g.id === groupId)?.waiting ?? 0 : o.waiting;
  });
}
/** Whether an index task is under way (re-renders only when that changes). */
export const useIndexBusy = () => useSyncExternalStore(api.indexing.subscribe, () => api.indexing.getSnapshot().active?.state === 'running');
const indexFilesKey = (q) => `index-files:${JSON.stringify(q)}`;
const INDEX_TOPICS = ['index', 'library', 'models'];
/** Files and their index for the index page (see data/api: indexing.files). The text is debounced. */
export function useIndexFiles(query) {
  const text = useDebounced(query.text ?? '', 160);
  const q = { ...query, text: text.trim() };
  return useQuery(indexFilesKey(q), () => api.indexing.files(q), INDEX_TOPICS);
}
/** The waiting files of a group (the whiteboard chooses them in one go). → { data: { ids } } */
export const useWaitingFiles = (groupId) => useQuery(groupId ? `index-waiting:${groupId}` : null, () => api.indexing.waitingIn(groupId), INDEX_TOPICS);
/** How many of these files still need each kind built: { tagging, embedding, metadata }. Pass null to skip. */
const needsKey = (ids) => (ids?.length ? `index-needs:${ids.length}:${[...ids].sort().join(',')}` : null);
const fetchNeeds = (key, ids) => () => api.indexing.needs(ids).then((data) => ({ key, data }));
export function useIndexNeeds(ids) {
  const key = needsKey(ids);
  const res = useQuery(key, fetchNeeds(key, ids), INDEX_TOPICS);
  return key && res.data?.key === key ? res.data.data : undefined;
}
/** Find out what these files need before a re-index choice opens (on pointing at its button), so it opens decided. */
export function prefetchIndexNeeds(ids) {
  const key = needsKey(ids);
  if (key) prefetch(key, fetchNeeds(key, ids), INDEX_TOPICS);
}
export const indexActions = {
  /** Index the waiting files (of a group, or all). → { ok, taskId, files } */
  indexWaiting: api.indexing.indexWaiting,
  /** Build these kinds again for the files. → { ok, taskId } | { ok: false, error } */
  reindex: api.files.reindex,
};
/** What the index page shows as it opens: the list of files waiting, in every group. */
export const prefetchIndex = () => prefetch(indexFilesKey({ groupId: null, show: 'needs', kind: null, state: null, text: '' }), () => api.indexing.files({ show: 'needs' }), INDEX_TOPICS);

// ------------------------------------------------------------------ statistics
/** What the statistics page draws with: its parts, buckets, types, metrics and ranges, and the day arithmetic (data/domain/stats.js). */
export const statsRules = api.stats;
// (the folder's parts change with the image index and the snapshots; a scope's files only with the gallery)
const STORAGE_TOPICS = ['library', 'snapshots', 'index'];
const SCOPE_TOPICS = ['library'];
const ACTIVITY_TOPICS = ['library', 'activity', 'snapshots'];
const scopeKey = (q) => `stats-scope:${q.groupId ?? ''}|${q.configId ?? ''}|${q.colorId ?? ''}`;
const fetchScope = (q) => () => api.stats.scope({ groupId: q.groupId ?? null, configId: q.configId ?? null, colorId: q.colorId ?? null });
/** What the database folder is made of, and its drive (see data/api: stats.storage). */
export const useStorage = () => useQuery('stats-storage', api.stats.storage, STORAGE_TOPICS);
/** A scope of the storage tab: the gallery, a group or a colour group (see data/api: stats.scope). */
export const useStatsScope = (scope) => useQuery(scopeKey(scope), fetchScope(scope), SCOPE_TOPICS);
/** Get a scope ready before it is opened (the pointer is on its way to it). */
export const prefetchStatsScope = (scope) => prefetch(scopeKey(scope), fetchScope(scope), SCOPE_TOPICS);
/** A scope's files, the largest first: scope + { bucket, type }. */
export function useStatsFiles(query) {
  const key = `stats-files:${JSON.stringify(query)}`;
  return useQuery(key, () => api.stats.files(query), SCOPE_TOPICS);
}
/** The activity record, every day (see data/api: stats.activity). */
export const useActivity = () => useQuery('stats-activity', api.stats.activity, ACTIVITY_TOPICS);
/** One day of it: its row, the files added that day, the snapshots taken. */
export const useActivityDay = (day) => useQuery(day ? `stats-day:${day}` : null, () => api.stats.day(day), ACTIVITY_TOPICS);
/** What the statistics page shows as it opens. */
export const prefetchStats = () => {
  prefetch('stats-storage', api.stats.storage, STORAGE_TOPICS);
  prefetch(scopeKey({}), fetchScope({}), SCOPE_TOPICS);
  prefetch('stats-activity', api.stats.activity, ACTIVITY_TOPICS);
};
/** The clock of time spent in Prism (the activity record): started once, by the app shell. */
export { usePresenceClock } from './presence.js';

/** The reminder of automatic indexing showing now, or null. */
export const useReminder = () => useLive(api.reminders);
export const reminderActions = { dismiss: api.reminders.dismiss };

/**
 * A page setting saved optimistically: the page changes at once, the save is fire-and-forget, and the stored value
 * is only read again the next time the page loads.
 */
export function useOptimisticView(stored, save) {
  const [local, setLocal] = useState(null);
  const view = local ?? stored;
  const current = useRef(view);
  current.current = view;
  const update = useCallback((patch) => {
    const next = { ...current.current, ...patch };
    setLocal(next);
    save(next);
  }, [save]);
  return [view, update];
}

// ------------------------------------------------------------------ access: sign-in, server mode, MCP, first run
export const useAccess = () => useLive(api.access);
export const accessActions = {
  login: api.access.login,
  lock: api.access.lock,
  setPassword: api.access.setPassword,
  disablePassword: api.access.disablePassword,
  setServer: api.access.setServer,
  setMcp: api.access.setMcp,
  completeSetup: api.access.completeSetup,
};

// ------------------------------------------------------------------ MCP keys
export const MCP_PERMISSIONS = api.mcp.PERMISSIONS;
export const useMcpKeys = () => useQuery(...Q.mcpKeys);
export const mcpActions = { create: api.mcp.create, update: api.mcp.update, remove: api.mcp.remove, regenerate: api.mcp.regenerate };
export const mcpClientConfig = api.mcp.clientConfig;
export const prefetchMcp = () => { prefetch(...Q.mcpKeys); prefetch(...Q.groups); };

// ------------------------------------------------------------------ snapshots (data backup)
export const useBackup = () => useQuery(...Q.backup);
export const useBackupChanges = (id) => useQuery(id ? `backup-changes:${id}` : null, () => api.backup.changes(id), ['snapshots', 'library']);
export const prefetchBackup = () => { prefetch(...Q.backup); prefetch('backup-changes:working', () => api.backup.changes('working'), ['snapshots', 'library']); };
export const backupActions = {
  create: api.backup.create,
  load: thenRefresh(api.backup.load),
  remove: api.backup.remove,
  restore: api.backup.restore,
  exportTo: api.backup.exportTo,
  inspect: api.backup.inspect,
  importFrom: api.backup.importFrom,
};

// ------------------------------------------------------------------ export and file names
const exportScopeKey = (scope, groupId) => (scope === 'group' ? `group:${groupId}` : 'home');
export function useExportOptions(scope, groupIds) {
  const ids = useDebounced(groupIds, 120);
  return useQuery(`export-options:${scope}:${[...ids].sort().join(',')}`, () => api.exporter.options({ scope, groupIds: ids }), ['library']);
}
export function useExportPreview(config, maxPerDir) {
  const debounced = useDebounced(config, 160);
  const key = debounced ? `export-preview:${maxPerDir}:${JSON.stringify(debounced)}` : null;
  return useQuery(key, () => api.exporter.preview(debounced, { maxPerDir }), ['library']);
}
export const useLastExportConfig = (scope, groupId) => {
  const key = exportScopeKey(scope, groupId);
  return useQuery(`export-last:${key}`, () => api.exporter.lastConfig(key), ['exports']);
};
export const useKeyCatalog = () => useQuery(...Q.keyCatalog);
export function useNamePreview(template) {
  const t = useDebounced(template, 140);
  return useQuery(`name-preview:${JSON.stringify(t)}`, () => api.exporter.namePreview(t), ['library']);
}
export const prefetchExport = () => { prefetch(...Q.keyCatalog); prefetch(...Q.groups); };
/** What settings sections show besides the live settings: the snapshot summary and the file-name keys. */
export const prefetchSettings = () => { prefetch(...Q.backup); prefetch(...Q.keyCatalog); };
export const exportActions = {
  start: api.exporter.start,
  saveConfig: (scope, groupId, config) => api.exporter.saveConfig(exportScopeKey(scope, groupId), config),
  filterText: api.exporter.filterText,
  validate: api.exporter.validate,
};

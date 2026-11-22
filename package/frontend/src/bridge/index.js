// The bridge: React hooks and actions over the data layer. UI components import from here and nowhere else.
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import * as api from '../data/api/index.js';
import { useQuery, useSuspenseQuery, useDebounced, prefetch, preloadSuspense } from './query.js';

export { useDebounced };
export const FILE_KINDS = api.FILE_KINDS;

/** Queries that several views share, and that can be loaded ahead of the view that shows them. */
const Q = {
  home: ['home', api.library.home, ['library']],
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
export const useGroup = (id) => useSuspenseQuery(`group:${id}`, () => api.library.group(id), ['library']);
export const useGroupList = () => useQuery(...Q.groups);
export const useColorGroupList = () => useQuery(...Q.colorGroups);
export const useGroupPictures = (id) => useQuery(id ? `group-pictures:${id}` : null, () => api.library.groupPictures(id), ['library']);

export const libraryActions = {
  createGroup: api.library.createGroup,
  updateGroup: api.library.updateGroup,
  deleteGroup: api.library.deleteGroup,
  setGroupOrder: api.library.setGroupOrder,
  randomFile: api.library.randomFile,
  sampleFiles: api.library.sampleFiles,
  saveHomeView: api.homeView.save,
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
export const settingsActions = { update: api.settings.update };
export const folderActions = { roots: api.folders.roots, list: api.folders.list, create: api.folders.create };

export const useModels = () => useLive(api.models);
export const modelActions = { download: api.models.download, redownload: api.models.redownload, use: api.models.use, cancel: api.models.cancel };

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
  load: api.backup.load,
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

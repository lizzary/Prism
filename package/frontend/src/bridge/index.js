// The bridge: React hooks and actions over the data layer. UI components import from here and nowhere else.
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import * as api from '../data/api/index.js';
import { useQuery, useSuspenseQuery, useDebounced, prefetch } from './query.js';

export { useDebounced };

/** Queries that several views share, and that can be loaded ahead of the view that shows them. */
const Q = {
  groups: ['groups', api.library.groups, ['library']],
  colorGroups: ['color-groups', api.library.colorGroups, ['library']],
  capabilities: ['search-capabilities', api.search.capabilities, ['library']],
  tagIndex: ['tag-index', api.tags.index, ['library']],
};

// ------------------------------------------------------------------ gallery
// Page data suspends (see useSuspenseQuery); smaller pieces load in place.
export const useHome = () => useSuspenseQuery('home', api.library.home, ['library']);
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

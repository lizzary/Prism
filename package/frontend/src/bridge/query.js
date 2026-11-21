// A small stale-while-revalidate cache between the UI and the data layer.
// Each query names the change topics it depends on; when the data layer announces a topic, live queries refetch.
import { use, useEffect, useReducer, useRef, useState } from 'react';
import { events } from '../data/api/index.js';

const cache = new Map();        // key → last data
const active = new Map();       // key → Set(refetch)

events.subscribe((topic) => {
  for (const [key, set] of active) {
    const topics = key.split('|')[0].split(',');
    // a language change relabels data, so settings refreshes every live query
    if (topic === 'settings' || topics.includes(topic)) for (const fn of set) fn();
  }
});

/**
 * useQuery(key, fetcher, topics) → { data, loading, error, refetch }
 * The previous data stays visible while a new key loads (no flashes between pages).
 * Pass key = null to skip.
 */
export function useQuery(key, fetcher, topics = []) {
  const full = key == null ? null : `${topics.join(',')}|${key}`;
  const [state, setState] = useState(() => ({ data: full ? cache.get(full) : undefined, loading: full != null, error: null }));
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    if (full == null) { setState({ data: undefined, loading: false, error: null }); return undefined; }
    let alive = true, seq = 0;
    const run = () => {
      const mine = ++seq;
      setState((s) => ({ data: cache.has(full) ? cache.get(full) : s.data, loading: true, error: null }));
      fetchRef.current().then(
        (data) => { if (!alive || mine !== seq) return; cache.set(full, data); setState({ data, loading: false, error: null }); },
        (error) => { if (!alive || mine !== seq) return; setState((s) => ({ ...s, loading: false, error })); },
      );
    };
    run();
    if (!active.has(full)) active.set(full, new Set());
    active.get(full).add(run);
    return () => { alive = false; active.get(full)?.delete(run); if (!active.get(full)?.size) active.delete(full); };
  }, [full]);

  return { ...state, refetch: () => { for (const fn of active.get(full) ?? []) fn(); } };
}

/** Load a query into the cache ahead of time, so the view that asks for it first renders with it at once. */
export function prefetch(key, fetcher, topics = []) {
  const full = `${topics.join(',')}|${key}`;
  if (cache.has(full) || active.has(full)) return;
  fetcher().then((data) => { if (!cache.has(full)) cache.set(full, data); }, () => {});
}

// ------------------------------------------------------------------ suspense queries (page data)
// Pages read their data through Suspense, so a navigation inside startTransition keeps the current page on screen
// until the next one is ready — and the view transition can morph between two complete pages.
const suspended = new Map();      // key → { status, data, error, promise, fetcher, listeners }

events.subscribe((topic) => {
  for (const [key, e] of suspended) {
    const topics = key.split('|')[0].split(',');
    if (topic !== 'settings' && !topics.includes(topic)) continue;
    if (!e.listeners.size) { suspended.delete(key); continue; }
    e.fetcher().then((data) => { e.data = data; e.status = 'done'; for (const fn of e.listeners) fn(); }, () => {});
  }
});

function suspenseEntry(full, fetcher) {
  let e = suspended.get(full);
  if (!e) {
    e = { status: 'pending', listeners: new Set(), fetcher };
    const p = fetcher();
    // React reads status/value on the thenable, so a settled promise never suspends again
    p.then((d) => { p.status = 'fulfilled'; p.value = d; e.status = 'done'; e.data = d; },
      (err) => { p.status = 'rejected'; p.reason = err; e.status = 'error'; e.error = err; suspended.delete(full); });
    e.promise = p;
    suspended.set(full, e);
  }
  e.fetcher = fetcher;
  return e;
}

/** useSuspenseQuery(key, fetcher, topics) → data. Suspends until the first load; later refreshes are silent. */
export function useSuspenseQuery(key, fetcher, topics = []) {
  const full = `${topics.join(',')}|${key}`;
  const [, rerender] = useReducer((x) => x + 1, 0);
  const e = suspenseEntry(full, fetcher);
  useEffect(() => {
    const entry = suspended.get(full) ?? e;
    if (!suspended.has(full)) suspended.set(full, entry);
    entry.listeners.add(rerender);
    return () => entry.listeners.delete(rerender);
  }, [full, e]);
  use(e.promise);
  return e.data;
}

/** Debounce a changing value (for search-as-you-type and live previews). */
export function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

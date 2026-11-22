// A group's page keeps itself fresh: it asks the data layer again every few seconds — cheaply, an unchanged gallery
// answers with its revision only — and lets the page show how long until the next look. The clock rests while the
// tab is hidden or while the page holds it (a drag in progress), and picks up where it stopped.
// Changes made on the page show at once: optimistic patches over the last answer, dropped once the answer that
// follows the write has arrived (or the write failed, which puts things back).
import { use, useSyncExternalStore } from 'react';
import * as api from '../data/api/index.js';

export const REFRESH_MS = 5000;
const feeds = new Map();

function createFeed(id) {
  let base = null;              // the last answer
  let patches = [];             // optimistic changes whose writes have not settled
  let first = null;             // the first load: the page suspends on it
  let busy = null;              // the request in flight
  let timer = 0, dueAt = 0, left = REFRESH_MS, cycle = 0, holds = 0, answeredAt = 0;
  let arrived = { ids: [], at: 0 };
  let snap = { data: null, clock: null, arrived };
  const subs = new Set();

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const resting = () => holds > 0 || hidden();
  const publish = () => {
    const data = base && patches.reduce((d, p) => p(d), base);
    snap = {
      data, arrived,
      clock: { cycle, interval: REFRESH_MS, left: dueAt ? Math.max(0, dueAt - Date.now()) : left, counting: !!dueAt, busy: !!busy, resting: resting() },
    };
    for (const fn of subs) fn();
  };

  const arm = () => {
    clearTimeout(timer);
    timer = 0;
    if (!subs.size || resting() || busy) { dueAt = 0; return; }
    dueAt = Date.now() + left;
    timer = setTimeout(() => refresh(), left);
  };
  const rest = () => {
    if (dueAt) left = Math.max(0, dueAt - Date.now());
    clearTimeout(timer);
    timer = 0;
    dueAt = 0;
  };

  /** Ask now. `force`: even if a request is under way (a write just landed, the answer in flight may predate it). */
  async function refresh({ force = false } = {}) {
    if (busy) {
      if (!force) return busy;
      await busy.catch(() => {});
    }
    rest();
    busy = (async () => {
      publish();
      try {
        const res = await api.groupPage.load(id, base?.rev);
        if (!res.unchanged) {
          if (base?.files && res.files) {
            const known = new Set(base.files.map((f) => f.id));
            const fresh = res.files.filter((f) => !known.has(f.id)).map((f) => f.id);
            if (fresh.length) arrived = { ids: fresh, at: Date.now() };
          }
          base = res;
        }
        answeredAt = Date.now();
      } finally {
        busy = null;
        cycle++;
        left = REFRESH_MS;
        arm();
        publish();
      }
    })();
    return busy;
  }

  const onVisibility = () => { if (resting()) rest(); else arm(); publish(); };

  return {
    getSnapshot: () => snap,
    subscribe(fn) {
      subs.add(fn);
      if (subs.size === 1) {
        document.addEventListener('visibilitychange', onVisibility);
        // coming back to the page: catch up at once (the copy kept here may be old)
        if (base && Date.now() - answeredAt > 1000) refresh().catch(() => {});
        else { arm(); publish(); }
      }
      return () => {
        subs.delete(fn);
        if (!subs.size) { rest(); document.removeEventListener('visibilitychange', onVisibility); }
      };
    },
    /** The first answer, for Suspense. */
    load() {
      if (!first) {
        const p = refresh().then(() => snap.data);
        // React reads status/value on the thenable, so a settled load never suspends again
        p.then((v) => { p.status = 'fulfilled'; p.value = v; }, (e) => { p.status = 'rejected'; p.reason = e; first = null; });
        first = p;
      }
      return first;
    },
    refresh: () => refresh({ force: true }),
    /** Rest the clock while something on the page must not move under the pointer. → release */
    hold() {
      holds++;
      rest();
      publish();
      let released = false;
      return () => { if (released) return; released = true; holds--; arm(); publish(); };
    },
    /** Show `patch` (data → data) at once while `write` runs; the answer after the write takes over. */
    async change(patch, write) {
      patches.push(patch);
      publish();
      try {
        const r = await write();
        await refresh({ force: true }).catch(() => {});
        return r;
      } finally {
        patches = patches.filter((p) => p !== patch);
        publish();
      }
    },
    get active() { return subs.size > 0; },
  };
}

export function feedOf(id) {
  let f = feeds.get(id);
  if (!f) { f = createFeed(id); feeds.set(id, f); }
  return f;
}

/** After a write elsewhere (a dialog, a snapshot loaded…), pages on screen look again at once. */
export function refreshFeeds() {
  for (const f of feeds.values()) if (f.active) f.refresh().catch(() => {});
}

/**
 * → { data, clock: { cycle, interval, left (ms to the next look), counting, busy, resting }, arrived: { ids (files new in
 * the last answer), at } }. Suspends until the first answer.
 */
export function useFeed(id) {
  const feed = feedOf(id);
  const snap = useSyncExternalStore(feed.subscribe, feed.getSnapshot);
  // always asked (React expects the same hooks every render); once the first answer is in, it no longer suspends
  use(feed.load());
  return snap;
}

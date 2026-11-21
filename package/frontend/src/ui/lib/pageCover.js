// Is a modal layer (dialog, sheet, search) covering the page? Moving art behind it can rest meanwhile:
// it is dimmed and blurred anyway, and repainting it under a blurred scrim costs every frame.
let layers = 0;
const subs = new Set();

export const pageCover = {
  active: () => layers > 0,
  subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  /** A layer arrives (returns its leave function). */
  enter() {
    if (layers++ === 0) for (const fn of subs) fn(true);
    let left = false;
    return () => { if (left) return; left = true; if (--layers === 0) for (const fn of subs) fn(false); };
  },
};

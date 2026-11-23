// A colour group to show once its group's page is there — chosen in search. The page takes it as it opens (or at
// once, when it is already the page on screen): it puts the colour group's configuration to use if it is not, then
// goes to the colour group.
let pending = null;
const subs = new Set();

export const colorArrival = {
  /** colorId of configId, in group groupId. */
  set(groupId, colorId, configId) {
    pending = { groupId, colorId, configId };
    for (const fn of subs) fn();
  },
  /** The colour group waiting for this group's page, taken (it is shown once). → { colorId, configId } | null */
  take(groupId) {
    if (pending?.groupId !== groupId) return null;
    const p = pending;
    pending = null;
    return p;
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

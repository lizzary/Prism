// A group's covers: the pictures its card on the home page glances through, and that its page opens with. The first
// is the main cover — the card shows it at rest and the wall lays the card out at its proportions. Until someone
// chooses, Prism picks them itself (the newest picture, then a few from all through the group, so a new upload shows
// up on the card). Choosing starts from the covers on show, and from then on they stay as chosen.
// The edits take the covers on show (file ids, main first) and return the new list.

export const MAX_COVERS = 8;
export const AUTO_COVERS = 6;

/**
 * Prism's own picks: the newest picture (the latest import), then a few spread evenly through the rest. Pictures
 * only; a group holding nothing but videos shows their poster frames.
 */
export function autoCovers(files, n = AUTO_COVERS) {
  const pictures = files.filter((f) => f.kind === 'image');
  const pool = (pictures.length ? pictures : files).slice().sort((a, b) => String(b.importedAt ?? '').localeCompare(String(a.importedAt ?? '')));
  if (pool.length <= n) return pool;
  const rest = pool.slice(1);
  return [pool[0], ...Array.from({ length: n - 1 }, (_, k) => rest[Math.floor(((k + 0.5) * rest.length) / (n - 1))])];
}

export const coverEdits = {
  /** `id` joins at the end. → the new list, or null when there is no room left */
  add: (ids, id) => (ids.includes(id) ? ids : ids.length >= MAX_COVERS ? null : [...ids, id]),
  remove: (ids, id) => ids.filter((x) => x !== id),
  /** `id` becomes the main cover; one that was not a cover yet joins, and if the covers are full the last makes way. */
  main: (ids, id) => [id, ...ids.filter((x) => x !== id)].slice(0, MAX_COVERS),
  /** A cover leaves; any other picture joins at the end. → the new list, or null when there is no room left */
  toggle: (ids, id) => (ids.includes(id) ? ids.filter((x) => x !== id) : coverEdits.add(ids, id)),
  /** `id` moves to `index` among the others. */
  move: (ids, id, index) => {
    const rest = ids.filter((x) => x !== id);
    rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
    return rest;
  },
};

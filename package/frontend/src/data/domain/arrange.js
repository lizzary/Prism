// How a group's files are laid out for browsing: sorted, gathered into the colour groups of the configuration in
// use, trimmed to a number per colour group if asked, and split into pages. The page, the lightbox and the slideshow
// all walk the same order.

/** The section of the files that belong to no colour group (of the configuration in use). */
export const NONE = '~none';

export const SORTS = ['created', 'resolution', 'size', 'custom'];
export const QUALITY_LEVELS = ['original', 'high', 'medium', 'low'];
export const LAYOUTS = ['single', 'double', 'mixed'];
/** Files per page; 0 shows them all. */
export const PAGE_SIZES = [50, 100, 200, 500, 1000, 0];
export const SIZE_LEVELS = [1, 2, 3, 4, 5];
export const SLIDE_SECONDS = [3, 5, 8, 12, 20];

/** A group's page settings, until the user changes them. */
export const DEFAULT_VIEW = {
  sort: 'created', dir: 'desc',
  size: 3, natural: true, quality: 'medium',
  layout: 'single', limited: false, limit: 10,
  pageSize: 0,
  collapsed: [], expanded: [],
  slide: 5,
};

/** Keep only known settings with sensible values (what is saved, and what a page starts from). */
export function cleanView(v = {}) {
  const pick = (k, ok) => (ok(v[k]) ? v[k] : DEFAULT_VIEW[k]);
  const ids = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');
  return {
    sort: pick('sort', (x) => SORTS.includes(x)),
    dir: pick('dir', (x) => x === 'asc' || x === 'desc'),
    size: pick('size', (x) => SIZE_LEVELS.includes(x)),
    natural: pick('natural', (x) => typeof x === 'boolean'),
    quality: pick('quality', (x) => QUALITY_LEVELS.includes(x)),
    layout: pick('layout', (x) => LAYOUTS.includes(x)),
    limited: pick('limited', (x) => typeof x === 'boolean'),
    limit: pick('limit', (x) => Number.isInteger(x) && x >= 1 && x <= 999),
    pageSize: pick('pageSize', (x) => PAGE_SIZES.includes(x)),
    collapsed: pick('collapsed', ids),
    expanded: pick('expanded', ids),
    slide: pick('slide', (x) => SLIDE_SECONDS.includes(x)),
  };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1);

/**
 * The order of a sort. Ties fall back to the creation date, then the name, so the order never shuffles between
 * refreshes. In the custom order, files never placed by hand come first, the most recently imported first.
 */
function comparator(sort, dir, order) {
  const k = dir === 'asc' ? 1 : -1;
  const created = (a, b) => a.createdAt.localeCompare(b.createdAt);
  switch (sort) {
    case 'resolution': return (a, b) => k * (a.width * a.height - b.width * b.height) || k * created(a, b) || byName(a, b);
    case 'size': return (a, b) => k * (a.size - b.size) || k * created(a, b) || byName(a, b);
    case 'custom': {
      const at = new Map(order.map((id, i) => [id, i]));
      return (a, b) => {
        const ia = at.get(a.id), ib = at.get(b.id);
        if (ia == null && ib == null) return b.importedAt.localeCompare(a.importedAt) || byName(a, b);
        if (ia == null) return -1;
        if (ib == null) return 1;
        return ia - ib;
      };
    }
    default: return (a, b) => k * created(a, b) || byName(a, b);
  }
}

/** The colour groups of the configuration in use: [{ id, name, color }] (empty when the group uses none). */
export function activeColors(data) {
  return data.configs.find((c) => c.id === data.activeConfigId)?.groups ?? [];
}

/** A file's colour group in the configuration in use (its key), or NONE. */
export const colorKeyOf = (file, configId, known) => {
  const id = configId ? file.colors?.[configId] : null;
  return id && known.has(id) ? id : NONE;
};

/**
 * data: { files: [{ id, createdAt, importedAt, width, height, size, colors }], configs, activeConfigId, order }
 * view: page settings (see DEFAULT_VIEW); page: 1-based.
 * → {
 *   grouped        whether the files are gathered into colour groups at all
 *   sequence       every file in browsing order (the lightbox and the slideshow walk this)
 *   sections       every section in order: { key, color: { id, name, color } | null, files (all, in order), total,
 *                  collapsed, expanded, limited, visible (what the settings let show) }
 *   page           { index, count, total (files shown across pages), from, to,
 *                    sections: [{ key, color, files (on this page), more (files held back by the limit, shown as one
 *                    tile at the end), total, collapsed, expanded, limited }] }
 * }
 */
export function arrange(data, view, page = 1) {
  const colors = activeColors(data);
  const grouped = !!data.activeConfigId && data.configs.some((c) => c.id === data.activeConfigId);
  const known = new Set(colors.map((c) => c.id));
  const sorted = [...data.files].sort(comparator(view.sort, view.dir, data.order ?? []));

  const byKey = new Map([...colors.map((c) => [c.id, []]), [NONE, []]]);
  for (const f of sorted) byKey.get(grouped ? colorKeyOf(f, data.activeConfigId, known) : NONE).push(f);

  const collapsed = new Set(view.collapsed), expanded = new Set(view.expanded);
  const keys = grouped ? [...colors.map((c) => c.id), NONE] : [NONE];
  const sections = keys.map((key) => {
    const files = byKey.get(key);
    const isCollapsed = grouped && collapsed.has(key);
    const isExpanded = expanded.has(key);
    const limited = grouped && view.limited && !isExpanded && files.length > view.limit;
    return {
      key, color: colors.find((c) => c.id === key) ?? null, files, total: files.length,
      collapsed: isCollapsed, expanded: isExpanded, limited,
      visible: isCollapsed ? [] : limited ? files.slice(0, view.limit) : files,
    };
  })
    // files outside every colour group form a section only when there are some (or nowhere else to drop them out)
    .filter((s) => s.key !== NONE || s.total > 0 || (grouped && colors.length > 0));

  // pages count the files on show; a section with nothing on show sits where its files would be
  const size = view.pageSize > 0 ? view.pageSize : Infinity;
  const shown = sections.reduce((n, s) => n + s.visible.length, 0);
  const count = Math.max(1, Math.ceil(shown / size));
  const index = Math.min(Math.max(1, page), count);
  const lo = (index - 1) * size, hi = index * size;
  let at = 0;
  const onPage = [];
  for (const s of sections) {
    const start = at, end = at + s.visible.length;
    at = end;
    if (!s.visible.length) {
      const home = Math.min(count, Math.floor(start / size) + 1);
      if (home === index) onPage.push({ ...pageSection(s), files: [], more: s.limited ? s.total - s.visible.length : 0 });
      continue;
    }
    if (end <= lo || start >= hi) continue;
    const files = s.visible.slice(Math.max(0, lo - start), Math.min(s.visible.length, hi - start));
    const last = end <= hi;
    onPage.push({ ...pageSection(s), files, more: last && s.limited ? s.total - s.visible.length : 0 });
  }
  return {
    grouped,
    sequence: sections.flatMap((s) => s.files),
    sections,
    page: {
      index, count, total: shown, sections: onPage,
      from: shown ? lo + 1 : 0, to: Math.min(hi, shown),
    },
  };
}
const pageSection = (s) => ({ key: s.key, color: s.color, total: s.total, collapsed: s.collapsed, expanded: s.expanded, limited: s.limited });

/** The page a file is shown on, or null when the settings hide it (a folded colour group, or past the limit). */
export function pageOf(arranged, view, fileId) {
  const size = view.pageSize > 0 ? view.pageSize : Infinity;
  let at = 0;
  for (const s of arranged.sections) {
    const i = s.visible.findIndex((f) => f.id === fileId);
    if (i >= 0) return Math.floor((at + i) / size) + 1;
    at += s.visible.length;
  }
  return null;
}

/**
 * Move a batch of files into a section, before or after a file shown there (neither: at the section's end). The gap
 * is found among the files as shown — the batch's own included, so dropping a file next to itself leaves it there —
 * and the batch keeps its own order. → the new browsing order of every file, for the custom sort.
 */
export function placeBatch(arranged, ids, { section, before, after }) {
  const batch = new Set(ids);
  const stays = (id) => !batch.has(id);
  const moving = arranged.sequence.filter((f) => batch.has(f.id)).map((f) => f.id);
  const lists = arranged.sections.map((s) => ({ key: s.key, all: s.files.map((f) => f.id) }));
  if (!lists.some((l) => l.key === section)) lists.push({ key: section, all: [] });
  const target = lists.find((l) => l.key === section);
  const i = target.all.indexOf(before ?? after);
  const at = i < 0 ? target.all.length : before ? i : i + 1;
  const k = target.all.slice(0, at).filter(stays).length;
  const kept = lists.map((l) => ({ key: l.key, ids: l.all.filter(stays) }));
  kept.find((l) => l.key === section).ids.splice(k, 0, ...moving);
  return kept.flatMap((l) => l.ids);
}

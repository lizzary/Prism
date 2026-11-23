// Putting a configuration's colour groups in order: moving several of them together to a new place, and sorting all
// of them at once. The page, its outline and the colour-group editor share these rules.

/**
 * Move `ids` together to a new place among the others, keeping the order they are in now:
 * to = 'top' | 'bottom' | { before: id } | { after: id } (an id among the others).
 * → the new order, the same ids.
 */
export function moveTogether(order, ids, to) {
  const moving = new Set(ids);
  const going = order.filter((x) => moving.has(x));
  const rest = order.filter((x) => !moving.has(x));
  let at = rest.length;
  if (to === 'top') at = 0;
  else if (to?.before != null) { const i = rest.indexOf(to.before); if (i >= 0) at = i; }
  else if (to?.after != null) { const i = rest.indexOf(to.after); if (i >= 0) at = i + 1; }
  rest.splice(at, 0, ...going);
  return rest;
}

/**
 * One step up or down for `ids` (together), past the next one that is not moving. `among`: the ids that count as
 * steps (those on show while the list is filtered; all of them otherwise). → the new order
 */
export function stepTogether(order, ids, dir, among = order) {
  const moving = new Set(ids);
  const steps = among.filter((x) => !moving.has(x));
  const at = (x) => order.indexOf(x);
  const ends = order.filter((x) => moving.has(x)).map(at);
  if (!ends.length) return order;
  if (dir < 0) {
    const first = Math.min(...ends);
    const past = [...steps].reverse().find((x) => at(x) < first);
    return past == null ? order : moveTogether(order, ids, { before: past });
  }
  const last = Math.max(...ends);
  const past = steps.find((x) => at(x) > last);
  return past == null ? order : moveTogether(order, ids, { after: past });
}

// Names in the order people expect: numbers by value, then Latin letters A to Z, then Chinese characters by pinyin,
// then kana — each script together (a collator alone would put every Chinese name before "A").
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const SCRIPTS = [/^\p{Nd}/u, /^\p{Script=Latin}/u, /^\p{Script=Han}/u, /^[\p{Script=Hiragana}\p{Script=Katakana}]/u];
const scriptOf = (name) => { const t = name.trim(); const k = SCRIPTS.findIndex((re) => re.test(t)); return k < 0 ? SCRIPTS.length : k; };
/** A to Z (dir 1) or Z to A (dir -1) within each script; the scripts keep their order either way. */
const byName = (dir) => (a, b) => scriptOf(a.name) - scriptOf(b.name) || dir * collator.compare(a.name, b.name);

/** Hue (0–360), saturation and lightness (0–1) of a #rgb / #rrggbb colour. */
function hsl(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return { h: 0, s: 0, l: 0.5 };
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (hue * 60 + 360) % 360, s, l };
}

/** The ways all the colour groups can be sorted at once. */
export const COLOR_SORTS = ['name', 'name-desc', 'count', 'count-asc', 'color'];

/**
 * Every colour group in a new order. groups: [{ id, name, color }]; counts: { id: files };
 * by: 'name' (A→Z; Chinese by pinyin) | 'name-desc' | 'count' (most files first) | 'count-asc' | 'color' (round the
 * colour wheel, the greys last). Ties keep their present order. → [id]
 */
export function sortColorGroups(groups, by, counts = {}) {
  const n = (g) => counts[g.id] ?? 0;
  const cmp = {
    name: byName(1),
    'name-desc': byName(-1),
    count: (a, b) => n(b) - n(a),
    'count-asc': (a, b) => n(a) - n(b),
    // round the wheel from the reds (the pinks just short of 360° count as reds), the near-greys last, light to dark
    color: (a, b) => {
      const x = hsl(a.color), y = hsl(b.color);
      const gx = x.s < 0.16, gy = y.s < 0.16;
      if (gx !== gy) return gx ? 1 : -1;
      const hue = (c) => (c.h + 25) % 360;
      return gx ? y.l - x.l : hue(x) - hue(y) || y.l - x.l;
    },
  }[by];
  return cmp ? [...groups].sort(cmp).map((g) => g.id) : groups.map((g) => g.id);
}

/**
 * Where `query` is found in `name` (ignoring case), for marking it: [[from, to]] — empty when it is not there.
 * Several words must all be found, in any order.
 */
export function findInName(name, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const low = name.toLowerCase();
  const out = [];
  for (const w of words) {
    const i = low.indexOf(w);
    if (i < 0) return [];
    out.push([i, i + w.length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

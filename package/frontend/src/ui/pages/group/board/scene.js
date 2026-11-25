// The whiteboard's scene: the group's files as square cards, gathered into a region per colour group of the
// configuration in use (and one for the files in none), and where every region is on the board. Pure and in board
// pixels: either renderer draws this scene, and the board's input hit-tests the scene
// itself — never what was drawn — so every renderer behaves the same.
//
// Where the regions go:
//   arranged   Prism packs them in colour-group order, each into the highest free place from the left (a skyline: the
//              small ones fill in under the short ones), into a block about as wide as a screen is to its height
//   by hand    once one is moved, every region keeps a place of its own (saved per configuration). A region that grows
//              pushes what it would cover aside — they come back when it shrinks — and one that has no place yet (a
//              new colour group) takes the nearest free spot after the one before it in order
//
// A region's size, by hand (saved per configuration too, see resizedSize):
//   cols       how many cards across its files are laid out in (rearranging: every file stays in sight)
//   w, h       its frame, smaller than its cards need (the cards keep their places; those past the frame are hidden,
//              so a colour group can be made small and quiet). Both can be set at once.

export const CARD = 76;            // a card's side
export const GAP = 8;              // between the cards of a region
export const PITCH = CARD + GAP;
export const PAD = 16;             // a region's margin round its cards
export const HEAD = 52;            // the band at the top of a region that holds its heading
export const SPACE = 44;           // between regions as Prism arranges them
export const ROOM = 24;            // the least room between regions put by hand
const MIN_COLS = 2, MAX_COLS = 32;
const SHAPE = 1.5;                 // a region's cards: about half again as many across as down
const ASPECT = 1.9;                // the arranged block: about as wide as the board's view is to its height
const SNAP = 8;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const snap = (v) => Math.round(v / SNAP) * SNAP;

/** The smallest frame a region can be given: room for its heading, no cards. */
export const MIN_W = 120, MIN_H = HEAD + PAD;
/** How wide a region of `cols` cards across is, and how tall one of `rows` cards down. */
export const widthOf = (cols) => 2 * PAD + cols * CARD + (cols - 1) * GAP;
export const heightOf = (rows) => HEAD + rows * CARD + (rows - 1) * GAP + PAD;

/**
 * How many cards across and down a region of n cards has, and the size they need — `cols` when it was set by hand,
 * else about half again as many across as down. An empty one keeps a row to drop into.
 */
export function regionSize(n, cols) {
  const c = cols ? clamp(Math.round(cols), 1, Math.max(MIN_COLS, n, 1)) : n ? clamp(Math.ceil(Math.sqrt(n * SHAPE)), MIN_COLS, MAX_COLS) : MIN_COLS;
  const rows = Math.max(1, Math.ceil(n / c));
  return { cols: c, rows, w: widthOf(c), h: heightOf(rows) };
}

/**
 * A region of n cards with a size set by hand (`size`: { cols, w, h }, any of them): its cards across and down, the
 * size they need (fw, fh), its frame (w, h — never larger than the cards need) and how many cards are past the frame.
 */
export function sizedRegion(n, size) {
  const fit = regionSize(n, size?.cols);
  const w = size?.w ? clamp(Math.round(size.w), MIN_W, fit.w) : fit.w;
  const h = size?.h ? clamp(Math.round(size.h), MIN_H, fit.h) : fit.h;
  // a card is in sight while its middle is inside the frame (the frame's edge fades out over the last of it)
  const visCols = clamp(Math.floor((w - PAD / 2 - PAD - CARD / 2) / PITCH) + 1, 0, fit.cols);
  const visRows = clamp(Math.floor((h - PAD / 2 - HEAD - CARD / 2) / PITCH) + 1, 0, fit.rows);
  let shown = 0;
  for (let row = 0; row < visRows; row++) shown += Math.min(visCols, n - row * fit.cols);
  return { cols: fit.cols, rows: fit.rows, fw: fit.w, fh: fit.h, w, h, visCols, visRows, hidden: Math.max(0, n - shown), cropX: w < fit.w, cropY: h < fit.h };
}

/** Resize from the region where the gesture began. Alt moves its frame while keeping its cell arrangement. */
export function sizeAtPointer({ region, edge, wx, wy, alt }) {
  const w = wx - region.x, h = wy - region.y;
  if (alt) {
    const size = { ...region.size, cols: region.cols };
    if (edge !== 'b') size.w = w;
    if (edge !== 'r') size.h = h;
    return size;
  }
  const cols = edge === 'b'
    ? Math.ceil(region.n / Math.max(1, Math.round((h - HEAD - PAD + GAP) / PITCH)))
    : Math.round((w - 2 * PAD + GAP) / PITCH);
  return { cols: Math.max(1, cols) };
}

/** A size set by hand, without what is the same as Prism's own (null: nothing left to keep). */
export function resizedSize(n, size) {
  if (!size) return null;
  const auto = regionSize(n).cols;
  const r = sizedRegion(n, size);
  const out = {};
  if (size.cols && r.cols !== auto) out.cols = r.cols;
  if (r.cropX) out.w = r.w;
  if (r.cropY) out.h = r.h;
  return Object.keys(out).length ? out : null;
}

/** Is card k of region r in sight (inside its frame)? */
export const inSight = (r, k) => k % r.cols < r.visCols && Math.floor(k / r.cols) < r.visRows;

/**
 * The regions of a page's sections (domain/arrange.js `sections`, every file in its order). Grouped: one per colour
 * group, then the files in none; otherwise the whole group as one region, named `name`.
 * sizes: { key: { cols, w, h } } set by hand.
 * → [{ key, name, color: '#rrggbb' | null, none (the files in no colour group), plain (the whole group: it uses no
 *   colour groups), ids: [fileId], n, size (by hand) | null, ...sizedRegion }]
 */
export function regionsOf(sections, { grouped, name, noneKey, sizes = {} }) {
  return sections.map((s) => ({
    key: s.key,
    name: grouped ? s.color?.name ?? null : name,
    color: grouped ? s.color?.color ?? null : null,
    none: grouped && s.key === noneKey,
    plain: !grouped,
    ids: s.files.map((f) => f.id),
    n: s.files.length,
    size: sizes[s.key] ?? null,
    ...sizedRegion(s.files.length, sizes[s.key]),
  }));
}

// ------------------------------------------------------------------ arranging
/**
 * Prism's own arrangement, in order, for a view of about `aspect` (width / height). Packed at the width that aspect
 * asks of their area, and again at widths corrected for the gaps that packing left; the one shown largest when the
 * whole board fits the view is kept. → Map(key → [x, y])
 */
export function packRegions(regions, aspect = ASPECT) {
  if (!regions.length) return new Map();
  const area = regions.reduce((a, r) => a + (r.w + SPACE) * (r.h + SPACE), 0);
  const widest = Math.max(...regions.map((r) => r.w));
  const boxOf = (at) => boundsOf(regions.map((r) => ({ x: at.get(r.key)[0], y: at.get(r.key)[1], w: r.w, h: r.h })));
  // how large the board looks fitted to such a view (higher is better)
  const score = (b) => 1 / Math.max(b.w / aspect, b.h);
  const first = Math.max(widest, Math.sqrt(area * aspect) - SPACE);
  let best = packAt(regions, first), bestScore = score(boxOf(best));
  const b = boxOf(best);
  const corrected = first * Math.sqrt(aspect / (b.w / b.h));
  for (const w of [corrected, (first + corrected) / 2]) {
    if (w < widest || Math.abs(w - first) / first < 0.04) continue;
    const at = packAt(regions, w), sc = score(boxOf(at));
    if (sc > bestScore) { best = at; bestScore = sc; }
  }
  return best;
}
function packAt(regions, inner) {
  const at = new Map();
  const width = inner + SPACE;
  // the skyline: segments [x, x + w) whose free space starts at y, left to right
  let sky = [{ x: 0, w: width, y: 0 }];
  for (const r of regions) {
    const W = r.w + SPACE;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + W > width + 0.5) break;
      let y = 0;
      for (let j = i; j < sky.length && sky[j].x < x + W - 0.5; j++) y = Math.max(y, sky[j].y);
      if (!best || y < best.y - 0.5 || (Math.abs(y - best.y) <= 0.5 && x < best.x)) best = { x, y };
    }
    best ??= { x: 0, y: Math.max(...sky.map((s) => s.y)) };
    at.set(r.key, [best.x, best.y]);
    sky = raise(sky, best.x, W, best.y + r.h + SPACE);
  }
  return at;
}
function raise(sky, x, w, y) {
  const out = [];
  for (const s of sky) {
    const a = s.x, b = s.x + s.w;
    if (b <= x + 0.5 || a >= x + w - 0.5) { out.push(s); continue; }
    if (a < x) out.push({ x: a, w: x - a, y: s.y });
    if (b > x + w) out.push({ x: x + w, w: b - x - w, y: s.y });
  }
  out.push({ x, w, y });
  out.sort((p, q) => p.x - q.x);
  const merged = [];
  for (const s of out) {
    const m = merged[merged.length - 1];
    if (m && Math.abs(m.y - s.y) < 0.5) m.w = s.x + s.w - m.x; else merged.push({ ...s });
  }
  return merged;
}

const overlaps = (p, x, y, w, h, room) => p.x < x + w + room && x < p.x + p.w + room && p.y < y + h + room && y < p.y + p.h + room;

/** Moved aside (right or down, whichever is shorter) until nothing placed covers it. → [x, y] */
function clear(placed, r, x, y) {
  for (let k = 0; k < 500; k++) {
    const hit = placed.find((p) => overlaps(p, x, y, r.w, r.h, ROOM));
    if (!hit) break;
    const right = hit.x + hit.w + ROOM - x, down = hit.y + hit.h + ROOM - y;
    if (right <= down) x += right; else y += down;
  }
  return [x, y];
}

/**
 * The free spot nearest to (x0, y0) for a w × h region among `placed`: where it is, else against the edges of the
 * regions round it, nearest first — looking a little further out each time. → [x, y]
 */
export function nearestFree(placed, w, h, x0, y0) {
  const within = (reach) => placed.filter((p) => p.x < x0 + w + reach && p.x + p.w > x0 - reach && p.y < y0 + h + reach && p.y + p.h > y0 - reach);
  if (!within(ROOM).some((p) => overlaps(p, x0, y0, w, h, ROOM))) return [x0, y0];
  for (const reach of [Math.max(w, h) + 300, 2 * Math.max(w, h) + 1200, 4 * Math.max(w, h) + 4000]) {
    const near = within(reach);
    // a spot is tried against everything it could touch: what is within its own reach, and its size, of the start
    const around = within(reach + Math.max(w, h) + ROOM);
    const xs = new Set([x0]), ys = new Set([y0]);
    for (const p of near) {
      xs.add(p.x + p.w + ROOM); xs.add(p.x - w - ROOM);
      ys.add(p.y + p.h + ROOM); ys.add(p.y - h - ROOM);
    }
    const tries = [];
    for (const x of xs) for (const y of ys) if (Math.abs(x - x0) <= reach && Math.abs(y - y0) <= reach) tries.push([x, y, (x - x0) ** 2 + (y - y0) ** 2]);
    tries.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of tries) if (!around.some((p) => overlaps(p, x, y, w, h, ROOM))) return [x, y];
  }
  return [x0, Math.max(...placed.map((p) => p.y + p.h)) + ROOM];
}

/** Regions put by hand (saved: key → [x, y]); see the top of this file. → Map(key → [x, y]) */
export function placeByHand(regions, saved) {
  const placed = [];
  const at = new Map();
  const put = (r, x, y) => { placed.push({ key: r.key, x, y, w: r.w, h: r.h }); at.set(r.key, [x, y]); };
  const known = regions.filter((r) => saved[r.key]).sort((a, b) => saved[a.key][1] - saved[b.key][1] || saved[a.key][0] - saved[b.key][0]);
  for (const r of known) put(r, ...clear(placed, r, ...saved[r.key]));
  let prev = null;
  for (const r of regions) {
    if (at.has(r.key) && saved[r.key]) { prev = r; continue; }
    const p = prev && at.get(prev.key);
    const start = p ? [p[0] + prev.w + SPACE, p[1]] : placed.length ? [Math.min(...placed.map((q) => q.x)), Math.max(...placed.map((q) => q.y + q.h)) + SPACE] : [0, 0];
    put(r, ...nearestFree(placed, r.w, r.h, ...start));
    prev = r;
  }
  return at;
}

/**
 * The scene. sections: domain/arrange.js `sections`; layout: where the regions were put by hand (null: Prism arranges
 * them). → { regions: [region + { x, y, i (its place in order) }], where: Map(fileId → [region index, card index]),
 *   bounds: { x, y, w, h } | null, byHand }
 */
export function buildScene(sections, { grouped, name, noneKey, layout = null, sizes, aspect = ASPECT }) {
  const regions = regionsOf(sections, { grouped, name, noneKey, sizes });
  const at = layout ? placeByHand(regions, layout) : packRegions(regions, aspect);
  regions.forEach((r, i) => { [r.x, r.y] = at.get(r.key) ?? [0, 0]; r.i = i; });
  const where = new Map();
  regions.forEach((r, ri) => r.ids.forEach((id, k) => where.set(id, [ri, k])));
  return { regions, where, bounds: boundsOf(regions), byHand: !!layout };
}

export function boundsOf(rects) {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Every region's place now, for saving it as put by hand. → { key: [x, y] } */
export const placesOf = (scene) => Object.fromEntries(scene.regions.map((r) => [r.key, [Math.round(r.x), Math.round(r.y)]]));

// ------------------------------------------------------------------ cards
/** The board position of card k of a region (its top left corner), relative to the region. */
export const cardOffset = (r, k) => [PAD + (k % r.cols) * PITCH, HEAD + Math.floor(k / r.cols) * PITCH];
export function cardRect(r, k) {
  const [dx, dy] = cardOffset(r, k);
  return { x: r.x + dx, y: r.y + dy, w: CARD, h: CARD };
}
/** Where a file's card is on the board, or null. */
export function cardOf(scene, id) {
  const w = scene.where.get(id);
  return w ? cardRect(scene.regions[w[0]], w[1]) : null;
}

/**
 * The cards of region r that meet the board rectangle `rect` inside its frame: [from, to) by rows and columns.
 * → { c0, c1, r0, r1 } | null
 */
export function cardSpan(r, rect) {
  const x0 = Math.max(rect.x, r.x), y0 = Math.max(rect.y, r.y);
  const x1 = Math.min(rect.x + rect.w, r.x + r.w), y1 = Math.min(rect.y + rect.h, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) return null;
  const lx0 = x0 - r.x - PAD, ly0 = y0 - r.y - HEAD, lx1 = x1 - r.x - PAD, ly1 = y1 - r.y - HEAD;
  const rows = Math.ceil(r.n / r.cols);
  const c0 = clamp(Math.floor(lx0 / PITCH), 0, r.cols), c1 = clamp(Math.ceil(lx1 / PITCH), 0, r.cols);
  const r0 = clamp(Math.floor(ly0 / PITCH), 0, rows), r1 = clamp(Math.ceil(ly1 / PITCH), 0, rows);
  return c0 < c1 && r0 < r1 ? { c0, c1, r0, r1 } : null;
}
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The cards whose square meets the board rectangle `rect` (a marquee). → [fileId] */
export function cardsIn(scene, rect) {
  const out = [];
  for (const r of scene.regions) {
    if (!meets(r, rect)) continue;
    const span = cardSpan(r, rect);
    if (!span) continue;
    for (let row = span.r0; row < span.r1; row++) {
      for (let c = span.c0; c < span.c1; c++) {
        const k = row * r.cols + c;
        if (k >= r.n) break;
        if (!inSight(r, k)) continue;
        const [dx, dy] = cardOffset(r, k);
        if (meets({ x: r.x + dx, y: r.y + dy, w: CARD, h: CARD }, rect)) out.push(r.ids[k]);
      }
    }
  }
  return out;
}

/**
 * What is at a board point: a region's edge to resize it by (within `edge` board px of its right or bottom side, a
 * little outside too), a card, a region's heading band, the rest of a region, or nothing.
 * → { kind: 'resize', region, edge: 'r' | 'b' | 'rb' } | { kind: 'card', region, k, id } | { kind: 'head' | 'region', region } | null
 */
export function hitTest(scene, x, y, edge = 0) {
  if (edge) {
    const out = edge * 0.5;
    for (let i = scene.regions.length - 1; i >= 0; i--) {
      const r = scene.regions[i];
      const right = x - (r.x + r.w), bottom = y - (r.y + r.h);
      if (x < r.x + MIN_W / 2 || y < r.y + HEAD || right > out || bottom > out) continue;
      const nearR = right > -edge, nearB = bottom > -edge;
      if (nearR || nearB) return { kind: 'resize', region: r, edge: nearR && nearB ? 'rb' : nearR ? 'r' : 'b' };
    }
  }
  for (let i = scene.regions.length - 1; i >= 0; i--) {
    const r = scene.regions[i];
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue;
    const lx = x - r.x - PAD, ly = y - r.y - HEAD;
    if (ly < 0) return { kind: 'head', region: r };
    const c = Math.floor(lx / PITCH), row = Math.floor(ly / PITCH);
    if (lx >= 0 && c < r.cols && lx - c * PITCH <= CARD && ly - row * PITCH <= CARD) {
      const k = row * r.cols + c;
      if (k < r.n && inSight(r, k)) return { kind: 'card', region: r, k, id: r.ids[k] };
    }
    return { kind: 'region', region: r };
  }
  return null;
}

// Where everything on a group's page goes. Tiles, colour-group boxes and their headings all get computed places, so
// a new sort, size or layout lets the tiles glide to their new places, and only what is on screen has to exist.
//
//   single   one colour group per row: a box with its heading inside its top, its tiles under it
//   double   two columns, filled in order: each colour group goes to the column that ends higher (the left one when
//            they are level), and two that end about level are squared off into a row. When one is much taller, the
//            colour groups after it move up beside it — a folded or short neighbour never leaves a tall empty box
//   mixed    tiles flow on from one colour group into the next, even within a row. Each colour group's run is a band
//            of its colour with a slim heading inside its top; a run that goes on in the next row leaves this row
//            through its open right end and comes back in through an open left end, its heading saying it carries on.

/** Five sizes, by how many tiles share the full width of a row: two at the largest, two more at each step down. */
export const LEVELS = {
  1: { cols: 10, gap: 4 },
  2: { cols: 8, gap: 6 },
  3: { cols: 6, gap: 8 },
  4: { cols: 4, gap: 10 },
  5: { cols: 2, gap: 12 },
};
const RATIO = [0.45, 2.6];      // extreme proportions are framed into this range (cropped, never squashed)
const TYPICAL = [0.6, 2];       // what a group's rows are sized for stays within this range

const PAD = 12, HEAD = 46, BOX_GAP = 18, COLS_GAP = 18, EMPTY = 66;   // single / double
const FPAD = 7, FHEAD = 30, ROW_GAP = 10, SEP = 2 * FPAD + 8;        // mixed

const clampRatio = (r) => Math.max(RATIO[0], Math.min(RATIO[1], r || 1));
const fileItem = (f, section) => ({ kind: 'file', id: f.id, r: f.width / f.height, section });

/** A group's files' proportions on average, framed as the tiles frame them: what its rows are sized for. */
export function typicalRatio(files) {
  if (!files.length) return 1;
  let sum = 0;
  for (const f of files) sum += clampRatio(f.width / f.height);
  return sum / files.length;
}

/**
 * The page's size in pixels: the side of a square tile (`cols` of them across the full width), and the height that
 * rows of own-proportion tiles aim for — tiles of the group's usual proportions then share a row about as many.
 */
function metrics(o) {
  const { cols, gap } = LEVELS[o.level] ?? LEVELS[3];
  const square = Math.max(24, (o.width - gap * (cols - 1)) / cols);
  const typical = Math.max(TYPICAL[0], Math.min(TYPICAL[1], o.ratio || 1));
  return { cols, gap, square, row: square / typical, full: o.width };
}

/**
 * Rows of items: justified at their own proportions, or equal squares. An item has proportions `r`, or a `fixed`
 * width (a folded colour group in the flow). gapOf(item, previous) → the gap before it.
 */
function flowRows(items, width, { natural }, M, gapOf) {
  if (!natural) {
    // as many squares as this width holds at the page's size (a box or a band is a little narrower than the page)
    const cols = Math.max(1, Math.round((M.cols * width) / M.full));
    const size = (width - M.gap * (cols - 1)) / cols;
    const rows = [];
    let row = [], x = 0;
    for (const it of items) {
      const w = it.fixed ?? size;
      let g = row.length ? gapOf(it, row[row.length - 1].it) : 0;
      if (row.length && x + g + w > width + 0.5) { rows.push({ h: size, items: row }); row = []; x = 0; g = 0; }
      row.push({ it, x: x + g, w });
      x += g + w;
    }
    if (row.length) rows.push({ h: size, items: row });
    return rows;
  }
  const target = M.row;
  const rows = [];
  let row = [], sr = 0, sf = 0, sg = 0;      // the row so far: its proportions, fixed widths and gaps
  // the height a row would have; a fixed width counts as the proportions it has at the target height
  const heightOf = (r, f, g) => (width - g) / (r + f / target);
  const flush = (last) => {
    const room = width - sf - sg;
    // a short last row keeps the target height instead of stretching across
    const h = sr > 0 ? room / sr : target;
    const fill = sr > 0 && room > 0 && (!last || h <= target * 1.08);
    const height = fill ? h : target;
    let x = 0;
    const out = row.map((e) => { x += e.g; const p = { it: e.it, x, w: e.f || e.r * height }; x += p.w; return p; });
    // the last picture takes what rounding left over, so a full row meets the edge exactly
    const k = fill ? row.findLastIndex((e) => !e.f) : -1;
    if (k >= 0) {
      const d = width - x;
      out[k].w += d;
      for (let i = k + 1; i < out.length; i++) out[i].x += d;
    }
    rows.push({ h: height, items: out.map((p) => ({ ...p, w: Math.max(1, p.w) })) });
    row = []; sr = 0; sf = 0; sg = 0;
  };
  for (const it of items) {
    const f = it.fixed ?? 0;
    const r = f ? 0 : clampRatio(it.r);
    const g = row.length ? gapOf(it, row[row.length - 1].it) : 0;
    const before = row.length ? heightOf(sr, sf, sg) : Infinity;
    const after = heightOf(sr + r, sf + f, sg + g);
    if (after > target) { row.push({ it, r, f, g }); sr += r; sf += f; sg += g; continue; }
    // this item would bring the row under the target: keep it here or start the next row with it, whichever
    // leaves the row nearer the target (compared as proportions, so tall and short count alike)
    if (row.length && Math.abs(Math.log(before / target)) < Math.abs(Math.log(after / target))) {
      flush(false);
      row.push({ it, r, f, g: 0 }); sr = r; sf = f; sg = 0;
    } else {
      row.push({ it, r, f, g }); sr += r; sf += f; sg += g;
      flush(false);
    }
  }
  if (row.length) flush(true);
  return rows;
}

/** Whole pixels, so neighbouring tiles share their edges exactly. */
const snap = (x, w) => { const a = Math.round(x); return [a, Math.max(1, Math.round(x + w) - a)]; };

const itemsOf = (section) => section.files.map((f) => fileItem(f, section.key));

/**
 * sections: the page's sections (domain/arrange.js `page.sections`).
 * o: { width, level, ratio (typicalRatio of the group's files), natural, mode: 'single' | 'double' | 'mixed', grouped }
 * → { height,
 *     tiles: [{ key, kind: 'file' | 'capsule', id, section, x, y, w, h }],
 *     boxes: [{ key, section, x, y, w, h, open: { left, right }, empty, collapsed, pair? }],
 *     heads: [{ key, section, x, y, w, h, kind: 'head' | 'tab' | 'cont' }],
 *     rows:  [{ y, h, x, w, section?, items: [{ id, kind, section, x, w }] }]   (for dropping) }
 */
export function layoutPage(sections, o) {
  if (!o.width) return { height: 0, tiles: [], boxes: [], heads: [], rows: [] };
  const M = metrics(o);
  if (!o.grouped) return plain(sections, o, M);
  return o.mode === 'mixed' ? flowing(sections, o, M) : boxed(sections, o, M);
}

function plain(sections, o, M) {
  const items = sections.flatMap(itemsOf);
  const rows = flowRows(items, o.width, o, M, () => M.gap);
  const out = { tiles: [], boxes: [], heads: [], rows: [] };
  let y = 0;
  for (const row of rows) {
    const ry = Math.round(y), rh = Math.round(y + row.h) - ry;
    const placed = row.items.map((p) => { const [x, w] = snap(p.x, p.w); return { p, x, w }; });
    for (const { p, x, w } of placed) out.tiles.push({ key: p.it.id, ...p.it, x, y: ry, w, h: rh });
    out.rows.push({ y: ry, h: rh, x: 0, w: o.width, items: placed.map(({ p, x, w }) => ({ id: p.it.id, kind: p.it.kind, section: p.it.section, x, w })) });
    y += row.h + M.gap;
  }
  return { ...out, height: Math.max(0, Math.round(y - M.gap)) };
}

function boxed(sections, o, M) {
  const two = o.mode === 'double';
  // two columns of one width; the gap between them takes the odd pixel
  const bw = two ? Math.floor((o.width - COLS_GAP) / 2) : o.width;
  const colX = two ? [0, o.width - bw] : [0];
  const inner = bw - 2 * PAD;
  const laid = sections.map((s) => {
    if (s.collapsed) return { s, h: HEAD, rows: [], folded: true };
    const items = itemsOf(s);
    if (!items.length) return { s, h: HEAD + EMPTY + PAD, rows: [], empty: true };
    const rows = flowRows(items, inner, o, M, () => M.gap);
    const body = rows.reduce((n, r) => n + r.h, 0) + M.gap * (rows.length - 1);
    return { s, h: HEAD + body + PAD, rows };
  });
  const placed = two ? columns(laid, M) : stacked(laid);
  const out = { tiles: [], boxes: [], heads: [], rows: [] };
  let height = 0;
  for (const b of placed) {
    const x = colX[b.col], y = Math.round(b.y), h = Math.round(b.y + b.h) - y;
    out.boxes.push({ key: b.s.key, section: b.s.key, x, y, w: bw, h, open: { left: false, right: false }, empty: !!b.empty, collapsed: b.s.collapsed, pair: !!b.pair });
    out.heads.push({ key: b.s.key, section: b.s.key, x, y, w: bw, h: HEAD, kind: 'head' });
    let ry = b.y + HEAD;
    for (const row of b.rows) {
      const ty = Math.round(ry), th = Math.round(ry + row.h) - ty;
      const items = row.items.map((p) => { const [px, pw] = snap(x + PAD + p.x, p.w); return { p, x: px, w: pw }; });
      for (const { p, x: px, w: pw } of items) out.tiles.push({ key: p.it.id, ...p.it, x: px, y: ty, w: pw, h: th });
      out.rows.push({ y: ty, h: th, x: x + PAD, w: inner, section: b.s.key, items: items.map(({ p, x: px, w: pw }) => ({ id: p.it.id, kind: p.it.kind, section: b.s.key, x: px, w: pw })) });
      ry += row.h + M.gap;
    }
    height = Math.max(height, y + h);
  }
  return { ...out, height };
}

function stacked(laid) {
  let y = 0;
  return laid.map((b) => { const p = { ...b, col: 0, y }; y += b.h + BOX_GAP; return p; });
}

/**
 * Two columns, filled in order: each colour group goes to the column that ends higher (the left one when level).
 * Once both columns have taken something since the last row, two that end about level are squared off into a row —
 * the shorter one's last box grows to meet the other (a folded one stays as it is). A column that ends much higher
 * takes the next colour groups instead, so they move up beside a tall one rather than a tall empty box standing there.
 */
function columns(laid, M) {
  const level = Math.min(200, Math.max(96, M.row * 0.6));
  const end = [0, 0], last = [null, null], fresh = [false, false];
  const placed = [];
  const square = () => {
    if (!fresh[0] || !fresh[1] || Math.abs(end[0] - end[1]) >= level) return;
    const y = Math.max(end[0], end[1]);
    for (const k of [0, 1]) if (end[k] < y && !last[k].folded) last[k].h += y - end[k];
    end[0] = end[1] = y;
    fresh[0] = fresh[1] = false;
  };
  for (const b of laid) {
    square();
    const k = end[0] <= end[1] ? 0 : 1;
    const p = { ...b, col: k, y: end[k] };
    placed.push(p);
    last[k] = p;
    fresh[k] = true;
    end[k] += p.h + BOX_GAP;
  }
  square();
  // two boxes starting on one line are a row: dragging a colour group then speaks of left and right
  const tops = new Set(placed.map((p) => `${p.col}:${Math.round(p.y)}`));
  for (const p of placed) p.pair = tops.has(`${1 - p.col}:${Math.round(p.y)}`);
  return placed;
}

function flowing(sections, o, M) {
  // a folded (or empty) colour group keeps its place in the flow as one slim card, whatever the size
  const capsule = Math.round(Math.max(96, Math.min(160, (o.natural ? M.row : M.square) * 0.62)));
  const items = [];
  for (const s of sections) {
    const first = items.length;
    if (s.collapsed || !s.files.length) items.push({ kind: 'capsule', id: `cap:${s.key}`, fixed: capsule, section: s.key });
    else items.push(...itemsOf(s));
    items[first] = { ...items[first], starts: true };
  }
  const width = o.width - 2 * FPAD;
  const rows = flowRows(items, width, o, M, (it, prev) => (it.section !== prev.section ? SEP : M.gap));
  const out = { tiles: [], boxes: [], heads: [], rows: [] };
  let y = 0;
  rows.forEach((row, ri) => {
    // the band: its heading inside the top, then the tiles, then a little padding
    const top = Math.round(y);
    const ty = Math.round(y + FHEAD), th = Math.round(y + FHEAD + row.h) - ty;
    const bottom = ty + th + FPAD;
    const placed = row.items.map((p) => { const [x, w] = snap(FPAD + p.x, p.w); return { p, x, w }; });
    // the row's runs: consecutive items of one colour group
    const runs = [];
    for (const q of placed) {
      const run = runs[runs.length - 1];
      if (run && run.section === q.p.it.section) run.items.push(q);
      else runs.push({ section: q.p.it.section, items: [q] });
    }
    const next = rows[ri + 1]?.items[0]?.it;
    runs.forEach((run, k) => {
      const a = run.items[0], b = run.items[run.items.length - 1];
      const fromAbove = k === 0 && !a.p.it.starts;
      const onBelow = k === runs.length - 1 && !!next && next.section === run.section && !next.starts;
      const left = fromAbove ? 0 : a.x - FPAD;
      const right = onBelow ? o.width : b.x + b.w + FPAD;
      const key = `${run.section}@${ri}`;
      out.boxes.push({ key, section: run.section, x: left, y: top, w: right - left, h: bottom - top, open: { left: fromAbove, right: onBelow }, capsule: a.p.it.kind === 'capsule' });
      out.heads.push({ key, section: run.section, x: left, y: top, w: right - left, h: FHEAD, kind: fromAbove ? 'cont' : 'tab' });
      for (const { p, x, w } of run.items) out.tiles.push({ key: p.it.id, ...p.it, x, y: ty, w, h: th });
    });
    out.rows.push({ y: ty, h: th, x: 0, w: o.width, items: placed.map(({ p, x, w }) => ({ id: p.it.id, kind: p.it.kind, section: p.it.section, x, w })) });
    y += FHEAD + row.h + FPAD + ROW_GAP;
  });
  return { ...out, height: Math.max(0, Math.round(y - ROW_GAP)) };
}

/** Where each colour group is on the page, top to bottom (all of its boxes or runs): key → { top, bottom }. */
export function sectionSpans(layout) {
  const spans = new Map();
  for (const b of layout.boxes) {
    const cur = spans.get(b.section);
    if (!cur) spans.set(b.section, { top: b.y, bottom: b.y + b.h });
    else { cur.top = Math.min(cur.top, b.y); cur.bottom = Math.max(cur.bottom, b.y + b.h); }
  }
  return spans;
}

// ------------------------------------------------------------------ dropping
const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * Where a batch of files dragged to (x, y) would land.
 * → { section, before?, after?, end? (the colour group's end), marker: { x, y, h } | null } | null
 * `before` / `after` name a file on show next to the gap; arrange's placeBatch skips over the batch's own files.
 */
export function dropFiles(layout, x, y) {
  // a heading or a folded colour group: to the end of that colour group
  for (const h of layout.heads) if (inside(h, x, y)) return { section: h.section, end: true, marker: null };
  for (const t of layout.tiles) if (t.kind === 'capsule' && inside(t, x, y)) return { section: t.section, end: true, marker: null };
  // inside a box: only its own rows (single / double); an empty or folded box takes the files at its end
  const box = layout.boxes.find((b) => inside(b, x, y) && !b.key.includes('@'));
  const rows = box ? layout.rows.filter((r) => r.section === box.section) : layout.rows;
  if (box && !rows.length) return { section: box.section, end: true, marker: null };
  let row = null, best = Infinity;
  for (const r of rows) {
    const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
    const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
    const d = dy * 3 + dx;
    if (d < best) { best = d; row = r; }
  }
  if (!row) return null;
  const items = row.items;
  const k = items.filter((it) => it.x + it.w / 2 < x).length;
  const prev = items[k - 1], next = items[k];
  // between two colour groups (flowing): the nearer one takes them
  let side;
  if (prev && next && prev.section !== next.section) side = x - (prev.x + prev.w) < next.x - x ? 'prev' : 'next';
  else side = next ? 'next' : 'prev';
  const gapX = (a, b) => (a && b ? (a.x + a.w + b.x) / 2 : a ? a.x + a.w + 4 : b.x - 4);
  if (side === 'next') {
    if (next.kind === 'capsule') return { section: next.section, end: true, marker: null };
    return { section: next.section, before: next.id, marker: { x: gapX(prev?.section === next.section ? prev : null, next), y: row.y, h: row.h } };
  }
  if (prev.kind === 'capsule') return { section: prev.section, end: true, marker: null };
  return { section: prev.section, after: prev.id, marker: { x: gapX(prev, next?.section === prev.section ? next : null), y: row.y, h: row.h } };
}

/**
 * Where a colour group dragged by its heading to (x, y) would go among the others (the files outside every colour
 * group stay last). → { index, marker: { x, y, w, h } } | null — index among the other colour groups.
 */
export function dropSection(layout, x, y, dragKey, order, mode) {
  let near = null, best = Infinity;
  for (const b of layout.boxes) {
    if (!order.includes(b.section)) continue;
    const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - (b.x + b.w) : 0;
    const dy = y < b.y ? b.y - y : y > b.y + b.h ? y - (b.y + b.h) : 0;
    const d = dx + dy * 2;
    if (d < best) { best = d; near = b; }
  }
  if (!near) return null;
  // side by side (a flowing run, or one of a row of two): left or right of it; otherwise above or below it
  const across = mode === 'mixed' || (mode === 'double' && near.pair);
  const after = across ? x > near.x + near.w / 2 : y > near.y + near.h / 2;
  const others = order.filter((k) => k !== dragKey);
  let index = others.indexOf(near.section);
  if (near.section === dragKey) index = order.indexOf(dragKey);
  else if (after) index += 1;
  const marker = across
    ? { x: (after ? near.x + near.w + 9 : near.x - 9) - 1.5, y: near.y, w: 3, h: near.h }
    : { x: near.x, y: (after ? near.y + near.h + 9 : near.y - 9) - 1.5, w: near.w, h: 3 };
  return { index, marker };
}

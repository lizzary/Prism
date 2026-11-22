// Where everything on a group's page goes. Tiles, colour-group boxes, headings and tabs all get computed places, so
// a new sort, size or layout lets the tiles glide to their new places, and only what is on screen has to exist.
//
//   single   one colour group per row: a box with a heading, its tiles inside
//   double   two colour groups share a row, left half then right half; the pair's boxes are made the same height
//   mixed    tiles flow on from one colour group into the next, even within a row. Each colour group's run sits in a
//            band of its colour with a tab above it; a run that goes on in the next row leaves this row through its
//            open right end and comes back in through an open left end, under a tab that says it carries on.

/** Five sizes: the height rows aim for (own proportions), the narrowest square, and the gap between tiles. */
export const LEVELS = {
  1: { row: 118, square: 108, gap: 4 },
  2: { row: 158, square: 146, gap: 6 },
  3: { row: 212, square: 194, gap: 8 },
  4: { row: 286, square: 262, gap: 10 },
  5: { row: 388, square: 352, gap: 12 },
};
const RATIO = [0.45, 2.6];      // extreme proportions are framed into this range (cropped, never squashed)
const MORE_RATIO = 0.78;        // the "+N" tile at the end of a colour group held to a number
const CAPSULE_RATIO = 0.95;     // a folded or empty colour group in the flowing layout

const PAD = 12, HEAD = 46, BOX_GAP = 18, COLS_GAP = 18, EMPTY = 66;    // single / double
const FPAD = 7, TAB = 28, ROW_GAP = 8, SEP = 2 * FPAD + 8;            // mixed

const clampRatio = (r) => Math.max(RATIO[0], Math.min(RATIO[1], r || 1));
const fileItem = (f, section) => ({ kind: 'file', id: f.id, r: f.width / f.height, section });

/** Rows of items: justified at their own proportions, or equal squares. gapOf(item, previous) → the gap before it. */
function flowRows(items, width, { natural }, L, gapOf) {
  if (!natural) {
    const cols = Math.max(1, Math.floor((width + L.gap) / (L.square + L.gap)));
    const size = (width - L.gap * (cols - 1)) / cols;
    const rows = [];
    let row = [], x = 0;
    for (const it of items) {
      let g = row.length ? gapOf(it, row[row.length - 1].it) : 0;
      if (row.length && x + g + size > width + 0.5) { rows.push({ h: size, items: row }); row = []; x = 0; g = 0; }
      row.push({ it, x: x + g, w: size });
      x += g + size;
    }
    if (row.length) rows.push({ h: size, items: row });
    return rows;
  }
  const target = L.row;
  const rows = [];
  let row = [], sr = 0, sg = 0;
  const heightOf = (r, g) => (width - g) / r;
  const flush = (h, last) => {
    // a short last row keeps the target height instead of stretching across
    const fill = !last || h <= target * 1.08;
    const height = fill ? h : target;
    let x = 0;
    const out = row.map((e, i) => {
      x += e.g;
      const w = i === row.length - 1 && fill ? width - x : e.r * height;
      const p = { it: e.it, x, w: Math.max(1, w) };
      x += w;
      return p;
    });
    rows.push({ h: height, items: out });
    row = []; sr = 0; sg = 0;
  };
  for (const it of items) {
    const r = clampRatio(it.r);
    const g = row.length ? gapOf(it, row[row.length - 1].it) : 0;
    const before = row.length ? heightOf(sr, sg) : Infinity;
    const after = heightOf(sr + r, sg + g);
    if (after > target) { row.push({ it, r, g }); sr += r; sg += g; continue; }
    // this item would bring the row under the target: keep it here or start the next row with it, whichever
    // leaves the row nearer the target (compared as proportions, so tall and short count alike)
    if (row.length && Math.abs(Math.log(before / target)) < Math.abs(Math.log(after / target))) {
      flush(before, false);
      row.push({ it, r, g: 0 }); sr = r; sg = 0;
    } else {
      row.push({ it, r, g }); sr += r; sg += g;
      flush(after, false);
    }
  }
  if (row.length) flush(heightOf(sr, sg), true);
  return rows;
}

/** Whole pixels, so neighbouring tiles share their edges exactly. */
const snap = (x, w) => { const a = Math.round(x); return [a, Math.max(1, Math.round(x + w) - a)]; };

function itemsOf(section) {
  const items = section.files.map((f) => fileItem(f, section.key));
  if (section.more) items.push({ kind: 'more', id: `more:${section.key}`, r: MORE_RATIO, section: section.key, count: section.more, after: section.files.at(-1)?.id ?? null });
  return items;
}

/**
 * sections: the page's sections (domain/arrange.js `page.sections`).
 * o: { width, level, natural, mode: 'single' | 'double' | 'mixed', grouped }
 * → { height,
 *     tiles: [{ key, kind: 'file' | 'more' | 'capsule', id, section, x, y, w, h, count?, after? }],
 *     boxes: [{ key, section, x, y, w, h, open: { left, right }, empty }],
 *     heads: [{ key, section, x, y, w, h, kind: 'head' | 'tab' | 'cont' }],
 *     rows:  [{ y, h, x, w, section?, items: [{ id, kind, section, x, w, after? }] }]   (for dropping) }
 */
export function layoutPage(sections, o) {
  const L = LEVELS[o.level] ?? LEVELS[3];
  if (!o.width) return { height: 0, tiles: [], boxes: [], heads: [], rows: [] };
  if (!o.grouped) return plain(sections, o, L);
  return o.mode === 'mixed' ? flowing(sections, o, L) : boxed(sections, o, L);
}

function plain(sections, o, L) {
  const items = sections.flatMap(itemsOf);
  const rows = flowRows(items, o.width, o, L, () => L.gap);
  const out = { tiles: [], boxes: [], heads: [], rows: [] };
  let y = 0;
  for (const row of rows) {
    const ry = Math.round(y), rh = Math.round(y + row.h) - ry;
    const placed = row.items.map((p) => { const [x, w] = snap(p.x, p.w); return { p, x, w }; });
    for (const { p, x, w } of placed) out.tiles.push({ key: p.it.id, ...p.it, x, y: ry, w, h: rh });
    out.rows.push({ y: ry, h: rh, x: 0, w: o.width, items: placed.map(({ p, x, w }) => ({ id: p.it.id, kind: p.it.kind, section: p.it.section, x, w, after: p.it.after })) });
    y += row.h + L.gap;
  }
  return { ...out, height: Math.max(0, Math.round(y - L.gap)) };
}

function boxed(sections, o, L) {
  const two = o.mode === 'double';
  const bw = two ? (o.width - COLS_GAP) / 2 : o.width;
  // whole-pixel columns, so each box's files meet its padding exactly
  const cols = (two ? [0, 1] : [0]).map((k) => snap(k * (bw + COLS_GAP), bw));
  const laid = sections.map((s, i) => {
    const inner = cols[i % cols.length][1] - 2 * PAD;
    if (s.collapsed) return { s, h: HEAD, rows: [], inner };
    const items = itemsOf(s);
    if (!items.length) return { s, h: HEAD + EMPTY + PAD, rows: [], empty: true, inner };
    const rows = flowRows(items, inner, o, L, () => L.gap);
    const body = rows.reduce((n, r) => n + r.h, 0) + L.gap * (rows.length - 1);
    return { s, h: HEAD + body + PAD, rows, inner };
  });
  const out = { tiles: [], boxes: [], heads: [], rows: [] };
  let y = 0;
  for (let i = 0; i < laid.length; i += two ? 2 : 1) {
    const band = two ? laid.slice(i, i + 2) : [laid[i]];
    const bandH = Math.max(...band.map((b) => b.h));
    band.forEach((b, k) => {
      const [x, w] = cols[k];
      const inner = b.inner;
      const h = Math.round(two ? bandH : b.h);
      out.boxes.push({ key: b.s.key, section: b.s.key, x, y: Math.round(y), w, h, open: { left: false, right: false }, empty: !!b.empty, collapsed: b.s.collapsed });
      out.heads.push({ key: b.s.key, section: b.s.key, x, y: Math.round(y), w, h: HEAD, kind: 'head' });
      let ry = y + HEAD;
      for (const row of b.rows) {
        const ty = Math.round(ry), th = Math.round(ry + row.h) - ty;
        const placed = row.items.map((p) => { const [px, pw] = snap(x + PAD + p.x, p.w); return { p, x: px, w: pw }; });
        for (const { p, x: px, w: pw } of placed) out.tiles.push({ key: p.it.id, ...p.it, x: px, y: ty, w: pw, h: th });
        out.rows.push({ y: ty, h: th, x: x + PAD, w: inner, section: b.s.key, items: placed.map(({ p, x: px, w: pw }) => ({ id: p.it.id, kind: p.it.kind, section: b.s.key, x: px, w: pw, after: p.it.after })) });
        ry += row.h + L.gap;
      }
    });
    y += bandH + BOX_GAP;
  }
  return { ...out, height: Math.max(0, Math.round(y - BOX_GAP)) };
}

function flowing(sections, o, L) {
  const items = [];
  for (const s of sections) {
    const first = items.length;
    if (s.collapsed || (!s.files.length && !s.more)) items.push({ kind: 'capsule', id: `cap:${s.key}`, r: CAPSULE_RATIO, section: s.key, count: s.total });
    else items.push(...itemsOf(s));
    items[first] = { ...items[first], starts: true };
  }
  const width = o.width - 2 * FPAD;
  const rows = flowRows(items, width, o, L, (it, prev) => (it.section !== prev.section ? SEP : L.gap));
  const out = { tiles: [], boxes: [], heads: [], rows: [] };
  let y = 0;
  rows.forEach((row, ri) => {
    const top = y + TAB;
    const ty = Math.round(top + FPAD), th = Math.round(top + FPAD + row.h) - ty;
    const placed = row.items.map((p) => { const [x, w] = snap(FPAD + p.x, p.w); return { p, x, w }; });
    // the row's runs: consecutive items of one colour group
    const runs = [];
    for (const q of placed) {
      const last = runs[runs.length - 1];
      if (last && last.section === q.p.it.section) last.items.push(q);
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
      out.boxes.push({ key, section: run.section, x: left, y: Math.round(top), w: right - left, h: th + 2 * FPAD, open: { left: fromAbove, right: onBelow }, capsule: a.p.it.kind === 'capsule' });
      out.heads.push({ key, section: run.section, x: left, y: Math.round(y), w: right - left, h: TAB, kind: fromAbove ? 'cont' : 'tab' });
      for (const { p, x, w } of run.items) out.tiles.push({ key: p.it.id, ...p.it, x, y: ty, w, h: th });
    });
    out.rows.push({ y: ty, h: th, x: 0, w: o.width, items: placed.map(({ p, x, w }) => ({ id: p.it.id, kind: p.it.kind, section: p.it.section, x, w, after: p.it.after })) });
    y = top + row.h + 2 * FPAD + ROW_GAP;
  });
  return { ...out, height: Math.max(0, Math.round(y - ROW_GAP)) };
}

// ------------------------------------------------------------------ dropping
const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * Where a batch of files dragged to (x, y) would land.
 * → { section, before?, after?, end? (the colour group's end), marker: { x, y, h } | null } | null
 * `before` / `after` name a file on show next to the gap; arrange's placeBatch skips over the batch's own files.
 */
export function dropFiles(layout, x, y) {
  // a heading, a tab or a folded colour group: to the end of that colour group
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
    if (next.kind === 'more') return { section: next.section, after: next.after, marker: { x: gapX(prev?.section === next.section ? prev : null, next), y: row.y, h: row.h } };
    if (next.kind === 'capsule') return { section: next.section, end: true, marker: null };
    return { section: next.section, before: next.id, marker: { x: gapX(prev?.section === next.section ? prev : null, next), y: row.y, h: row.h } };
  }
  if (prev.kind === 'capsule') return { section: prev.section, end: true, marker: null };
  const after = prev.kind === 'more' ? prev.after : prev.id;
  return { section: prev.section, after, marker: { x: gapX(prev, next?.section === prev.section ? next : null), y: row.y, h: row.h } };
}

/**
 * Where a colour group dragged by its heading to (x, y) would go among the others (the files outside every colour
 * group stay last). → { index, marker: { x, y, w, h } } | null — index among the other colour groups.
 */
export function dropSection(layout, x, y, dragKey, order, mode) {
  const firsts = new Map();
  for (const b of layout.boxes) if (!firsts.has(b.section) && order.includes(b.section)) firsts.set(b.section, b);
  let near = null, best = Infinity;
  for (const b of layout.boxes) {
    if (!order.includes(b.section)) continue;
    const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - (b.x + b.w) : 0;
    const dy = y < b.y ? b.y - y : y > b.y + b.h ? y - (b.y + b.h) : 0;
    const d = dx + dy * 2;
    if (d < best) { best = d; near = b; }
  }
  if (!near) return null;
  const after = mode === 'single' ? y > near.y + near.h / 2 : x > near.x + near.w / 2;
  const others = order.filter((k) => k !== dragKey);
  let index = others.indexOf(near.section);
  if (near.section === dragKey) index = order.indexOf(dragKey);
  else if (after) index += 1;
  const box = firsts.get(near.section);
  const marker = mode === 'single'
    ? { x: box.x, y: (after ? near.y + near.h + 9 : near.y - 9) - 1.5, w: box.w, h: 3 }
    : { x: (after ? near.x + near.w + 9 : near.x - 9) - 1.5, y: near.y, w: 3, h: near.h };
  return { index, marker };
}

// Treemaps for the statistics page (pure): a squarified layout — every block as close to a square as it can be
// (Bruls, Huijsing & van Wijk) — and the nesting the storage part draws: groups, the colour groups inside them, the
// files inside those.

/**
 * items: [{ key, value }] (value > 0), laid out in the rectangle, largest first. → [{ key, item, x, y, w, h }]
 */
export function squarify(items, x, y, w, h) {
  const out = [];
  const list = items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((n, it) => n + it.value, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let rest = list.map((it) => ({ it, area: it.value * scale }));
  let rx = x, ry = y, rw = w, rh = h;
  while (rest.length) {
    const side = Math.max(1e-6, Math.min(rw, rh));
    let n = 1, sum = rest[0].area, worst = worstOf(rest, 1, sum, side);
    while (n < rest.length) {
      const next = worstOf(rest, n + 1, sum + rest[n].area, side);
      if (next > worst) break;
      sum += rest[n].area; worst = next; n++;
    }
    const thick = sum / side;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const len = rest[i].area / thick;
      const r = rw >= rh ? { x: rx, y: ry + along, w: thick, h: len } : { x: rx + along, y: ry, w: len, h: thick };
      out.push({ key: rest[i].it.key, item: rest[i].it, ...r });
      along += len;
    }
    if (rw >= rh) { rx += thick; rw -= thick; } else { ry += thick; rh -= thick; }
    rest = rest.slice(n);
  }
  return out;
}
function worstOf(rest, n, sum, side) {
  let max = 0, min = Infinity;
  for (let i = 0; i < n; i++) { const a = rest[i].area; if (a > max) max = a; if (a < min) min = a; }
  const s2 = sum * sum, w2 = side * side;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

/** A rectangle drawn `g` px in from every side (so neighbours keep 2g of paper between them). */
export const inset = (r, g) => ({ ...r, x: r.x + g, y: r.y + g, w: Math.max(0, r.w - 2 * g), h: Math.max(0, r.h - 2 * g) });

/** A block's title strip, when the block is large enough to carry one. */
export const HEAD = 24;
export const hasHead = (r) => r.w >= 84 && r.h >= 58;

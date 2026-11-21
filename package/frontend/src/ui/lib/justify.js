// Justified rows: pictures keep their own proportions, every row is exactly as wide as the wall, and each row's
// height lands as close to the target as the pictures allow (so no row turns into a sliver or a banner).

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * @param {{ id: string, ratio: number }[]} items  ratio = width / height
 * @param {{ width: number, target: number, gap: number, minRatio?: number, maxRatio?: number }} o
 * @returns {{ height: number, items: { id: string, width: number }[] }[]}
 *   Extreme proportions are framed into [minRatio, maxRatio] (the picture is cropped to fit, never squashed).
 *   A short last row keeps the target height instead of stretching across the wall.
 */
export function justify(items, { width, target, gap, minRatio = 0.5, maxRatio = 2.4 }) {
  const rows = [];
  if (width <= 0) return rows;
  let row = [], sum = 0;
  const heightOf = (s, n) => (width - gap * (n - 1)) / s;

  const flush = (h, last) => {
    if (!row.length) return;
    const fill = !last || h <= target * 1.08;
    const height = fill ? h : target;
    // round to whole pixels and hand the remainder to the last picture, so a full row meets the edge exactly
    let used = 0;
    const out = row.map((it, i) => {
      const w = i === row.length - 1 && fill ? width - used - gap * (row.length - 1) : Math.round(it.r * height);
      used += w;
      return { id: it.id, width: Math.max(1, w) };
    });
    rows.push({ height: Math.round(height), items: out });
    row = []; sum = 0;
  };

  for (const it of items) {
    const r = clamp(it.ratio || 1, minRatio, maxRatio);
    const before = row.length ? heightOf(sum, row.length) : Infinity;
    const after = heightOf(sum + r, row.length + 1);
    if (after > target) { row.push({ id: it.id, r }); sum += r; continue; }
    // this picture would bring the row under the target: keep it here or start the next row with it,
    // whichever leaves the row nearer the target (compared as proportions, so tall and short count alike)
    if (row.length && Math.abs(Math.log(before / target)) < Math.abs(Math.log(after / target))) {
      flush(before, false);
      row.push({ id: it.id, r }); sum = r;
    } else {
      row.push({ id: it.id, r }); sum += r;
      flush(after, false);
    }
  }
  if (row.length) flush(heightOf(sum, row.length), true);
  return rows;
}

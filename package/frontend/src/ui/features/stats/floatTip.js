// Tips that float over the statistics page (rendered at the top of the document, position: fixed), kept whole inside
// the sheet: nothing they sit in — a map that clips its areas, a list that scrolls, a sticky bar — can hide them.

/** The sheet around an element (its tips stay inside it), or the window. */
export function boundsOf(el) {
  const r = el?.closest('[role="dialog"]')?.getBoundingClientRect();
  return r ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
}

/**
 * Put a tip next to a point. Beside and below it by default, flipping to the left or above where there is no room;
 * `above`: centred over the point (a column's top), flipping below it where there is no room.
 */
export function placeTip(el, { x, y }, { above = false, bounds } = {}) {
  if (!el) return;
  const b = bounds ?? boundsOf(null);
  const w = el.offsetWidth, h = el.offsetHeight, pad = 8, gap = 14;
  let left, top;
  if (above) {
    left = x - w / 2;
    top = y - 10 - h;
    if (top < b.top + pad) top = y + 10;
  } else {
    left = x + gap;
    top = y + gap;
    if (left + w > b.right - pad) left = x - gap - w;
    if (top + h > b.bottom - pad) top = y - gap - h;
  }
  left = Math.max(b.left + pad, Math.min(left, b.right - pad - w));
  top = Math.max(b.top + pad, Math.min(top, b.bottom - pad - h));
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

// A group's whiteboard settings, kept per group like its page settings: where its colour groups were put by hand (a
// layout per configuration — none means Prism arranges them), and which of the board's side panels are open.

/** The layout key of a group that uses no colour groups. */
export const PLAIN = '~plain';

/**
 * layouts: { configuration: { region key: [x, y] } } · sizes: { configuration: { region key: { cols, w, h } } } — set by
 * hand: cards across, and a frame smaller than the cards need (the cards past it are hidden) · index: the colour-group
 * index beside the board (null: open when there are many colour groups) · minimap
 */
export const DEFAULT_BOARD = { layouts: {}, sizes: {}, index: null, minimap: true };

/** Keep only well-formed settings: layouts are { configuration: { region key: [x, y] } } in whole board pixels. */
export function cleanBoard(b) {
  const layouts = {};
  for (const [cfg, at] of Object.entries(b?.layouts ?? {})) {
    if (!at || typeof at !== 'object') continue;
    const out = {};
    for (const [key, p] of Object.entries(at)) {
      if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) out[key] = [Math.round(p[0]), Math.round(p[1])];
    }
    if (Object.keys(out).length) layouts[cfg] = out;
  }
  const sizes = {};
  for (const [cfg, of] of Object.entries(b?.sizes ?? {})) {
    if (!of || typeof of !== 'object') continue;
    const out = {};
    for (const [key, sz] of Object.entries(of)) {
      const keep = {};
      for (const k of ['cols', 'w', 'h']) if (Number.isFinite(sz?.[k]) && sz[k] > 0) keep[k] = Math.round(sz[k]);
      if (Object.keys(keep).length) out[key] = keep;
    }
    if (Object.keys(out).length) sizes[cfg] = out;
  }
  return {
    layouts,
    sizes,
    index: typeof b?.index === 'boolean' ? b.index : DEFAULT_BOARD.index,
    minimap: typeof b?.minimap === 'boolean' ? b.minimap : DEFAULT_BOARD.minimap,
  };
}

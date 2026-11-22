// Shared app state for the UI: which overlay is open, and what the current page tells the top bar.
import { createContext, use, useCallback, useLayoutEffect, useMemo, useState } from 'react';

// ------------------------------------------------------------------ overlays
// Two contexts: the actions never change, so the many places that open an overlay are not re-rendered when one
// opens or closes; only the overlay layer itself reads what is open.
const ActionsCtx = createContext(null);
const StackCtx = createContext(null);

export function OverlayProvider({ children }) {
  const [stack, setStack] = useState({});
  const open = useCallback((name, props = {}) => setStack((s) => ({ ...s, [name]: { open: true, props, nonce: Date.now() } })), []);
  /**
   * Close an overlay. One that was handed over from another (see handOff) goes back to it — unless `leave`: the
   * user is going somewhere else, e.g. following a link out of it to a page.
   */
  const close = useCallback((name, { leave = false } = {}) => setStack((s) => {
    const cur = s[name];
    if (!cur?.open) return s;
    const back = !leave && cur.props.returnTo;
    if (!back) return { ...s, [name]: { ...cur, open: false, handoff: false } };
    return {
      ...s,
      [name]: { ...cur, open: false, handoff: true },
      [back.name]: { open: true, props: back.props, nonce: Date.now(), handoff: true },
    };
  }), []);
  /**
   * Replace one overlay with another that comes back to it when closed (settings → data backup, and back). Both
   * change in the same moment and are marked as a handoff, so the scrim stays put and only the panels move.
   */
  const handOff = useCallback((from, to, props = {}, backProps = {}) => setStack((s) => ({
    ...s,
    ...(s[from] && { [from]: { ...s[from], open: false, handoff: true } }),
    [to]: { open: true, props: { ...props, returnTo: { name: from, props: backProps } }, nonce: Date.now(), handoff: true },
  })), []);
  const actions = useMemo(() => ({ open, close, handOff }), [open, close, handOff]);
  return <ActionsCtx value={actions}><StackCtx value={stack}>{children}</StackCtx></ActionsCtx>;
}
/** { open(name, props), close(name, { leave }), handOff(from, to, props, backProps) } */
export const useOverlays = () => use(ActionsCtx);
/** name → { open, props, nonce, handoff } for every overlay opened so far */
export const useOverlayStack = () => use(StackCtx);

// ------------------------------------------------------------------ page meta (what the top bar shows)
const MetaCtx = createContext(null);

export function PageMetaProvider({ children }) {
  const [meta, setMeta] = useState({ scope: 'home', overArt: true, artHeight: 600 });
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <MetaCtx value={value}>{children}</MetaCtx>;
}
export const usePageMetaValue = () => use(MetaCtx).meta;

/**
 * A page describes itself to the top bar:
 *   scope: 'home' | 'group'; groupId; crumbs: [{ label, to }]; overArt (opens under artwork); artHeight
 */
export function usePageMeta(meta) {
  const { setMeta } = use(MetaCtx);
  const json = JSON.stringify(meta);
  // in the same commit as the page, so the page transition already sees the top bar the new page wants
  useLayoutEffect(() => { setMeta(JSON.parse(json)); }, [json, setMeta]);
}

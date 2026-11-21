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
  const close = useCallback((name) => setStack((s) => (s[name] ? { ...s, [name]: { ...s[name], open: false } } : s)), []);
  const actions = useMemo(() => ({ open, close }), [open, close]);
  return <ActionsCtx value={actions}><StackCtx value={stack}>{children}</StackCtx></ActionsCtx>;
}
/** { open(name, props), close(name) } */
export const useOverlays = () => use(ActionsCtx);
/** name → { open, props, nonce } for every overlay opened so far */
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

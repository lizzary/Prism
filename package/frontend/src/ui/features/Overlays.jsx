// Every overlay of the app. Their code (and the data they show first) is fetched once the page has settled, or as
// soon as the pointer heads for one of their entries (any element with `data-overlay="name"`): by the time an
// overlay is opened it is ready, so even the first opening comes in with its animation.
import { Component, useEffect, useReducer } from 'react';
import { prefetchSearch, prefetchTagIndex } from '../../bridge/index.js';
import { useOverlayStack, useOverlays } from '../../app/shell.jsx';
import { useT } from '../../i18n/index.jsx';
import { toast } from '../components/feedback.jsx';

const load = {
  search: () => import('./search/SearchPalette.jsx'),
  tags: () => import('./tags/TagIndex.jsx'),
  settings: () => import('./settings/SettingsDialog.jsx'),
  groupEditor: () => import('./editors/GroupDialog.jsx'),
};
const prefetch = { search: prefetchSearch, tags: prefetchTagIndex };

const panels = {};          // name → component, once its code is in
const pending = {};         // name → promise while it loads
function fetchPanel(name) {
  if (!load[name]) return Promise.resolve();
  prefetch[name]?.();
  pending[name] ??= load[name]().then((m) => { panels[name] = m.default; }, () => { delete pending[name]; });
  return pending[name];
}

export function Overlays() {
  const stack = useOverlayStack();
  const { close } = useOverlays();
  const [, rerender] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 800));
    const id = idle(() => Object.keys(load).forEach(fetchPanel), { timeout: 1500 });
    const intent = (e) => { const name = e.target.closest?.('[data-overlay]')?.dataset.overlay; if (name) fetchPanel(name); };
    document.addEventListener('pointerover', intent, { passive: true });
    document.addEventListener('focusin', intent);
    return () => {
      (window.cancelIdleCallback ?? clearTimeout)(id);
      document.removeEventListener('pointerover', intent);
      document.removeEventListener('focusin', intent);
    };
  }, []);

  // opened before its code arrived (a keyboard shortcut right after loading): it opens as soon as it is in
  useEffect(() => {
    let alive = true;
    for (const name of Object.keys(stack)) if (load[name] && !panels[name]) fetchPanel(name).then(() => { if (alive) rerender(); });
    return () => { alive = false; };
  }, [stack]);

  return Object.entries(stack).map(([name, entry]) => {
    const Panel = load[name] ? panels[name] : NotYet;
    return Panel && (
      <OverlayBoundary key={name} onError={() => close(name)} resetKey={entry.nonce}>
        <Panel open={entry.open} onClose={() => close(name)} {...entry.props} nonce={entry.nonce} />
      </OverlayBoundary>
    );
  });
}

/** A surface of a later stage (the export sheet): its entry says so instead of doing nothing. */
function NotYet({ open, onClose, nonce }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    toast(t('common.notYet'), { icon: 'sparkle' });
    onClose();
  }, [open, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** A failing overlay closes itself instead of taking the page down with it. */
class OverlayBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error(error); this.props.onError(); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? null : this.props.children; }
}

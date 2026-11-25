// Hash routing: #/ · #/group/:id · #/group/:id/file/:fileId (a file open in its group) · #/group/:id/board (the group's
// whiteboard) · #/group/:id/board/file/:fileId (a file open over the whiteboard)
// Works from any folder the Go service serves the build from, and keeps back/forward native.
import { addTransitionType, startTransition, useEffect, useState } from 'react';
import { afterViewTransition } from '../ui/lib/viewTransition.js';

function parse(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/');
  const [a, b] = parts;
  if (a === 'group' && b) {
    const board = parts[2] === 'board';
    const [c, d] = parts.slice(board ? 3 : 2);
    return { name: 'group', id: decodeURIComponent(b), board, fileId: c === 'file' && d ? decodeURIComponent(d) : null };
  }
  return { name: 'home' };
}
// a file opened in its group stays on the group's page: the key names the page, not the file
const keyOf = (r) => (r.name === 'home' ? 'home' : `${r.name}:${r.id}`);

// Scroll positions per entry: a new navigation starts at the top, back/forward returns where you were.
// The app restores them itself: the browser's own restoration would scroll the page being left (to wherever the
// next page's position happens to fit), and the page transition would then start from the wrong place.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const scrolls = new Map();
let pushing = false;
let current = location.hash || '#/';
let returned = false;

/** Was the page now showing reached by back / forward? Pages that return should not replay their entrance. */
export const cameBack = () => returned;

// A change that opens a file with its page (or leaves a file for another page) must cross-fade the whole document: the
// lightbox's room darkens over the page being left, or lifts off the page arriving. React drops the document's own
// snapshot from a page change it thinks touches only named parts — and the lightbox arrives through a portal, which it
// does not count — so the old page would vanish at once. It keeps the snapshot when the root element names itself, so
// the root is named for that change (as the browser names it anyway), and set free once the change has played.
let holdingRoot = false;
const root = () => document.documentElement;
function holdRoot() {
  holdingRoot = true;
  root().style.viewTransitionName = 'root';
}
function useReleaseRoot(route) {
  useEffect(() => {
    if (!holdingRoot) return undefined;
    return afterViewTransition(() => {
      holdingRoot = false;
      if (root().style.viewTransitionName === 'root') root().style.viewTransitionName = '';
    });
  }, [route]);
}

/**
 * Go to an in-app path. `replace`: take the place of the current entry instead of adding one (stepping through the
 * files of a lightbox), so Back leaves the lightbox rather than walking back through every file seen.
 */
export function navigate(path, { replace = false } = {}) {
  const next = `#${path}`;
  if (next === current) { if (!replace) window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  // up from the whiteboard (the bar's crumb) to the page it was opened from: back to it, not a new entry
  if (!replace && next === boardFrom && parse(current).board && !parse(current).fileId) { history.back(); return; }
  scrolls.set(current, window.scrollY);
  pushing = true;
  if (replace) location.replace(next); else location.hash = path;
}

/**
 * Leave a file for what it was opened over — its group's page, or the group's whiteboard (`board`): back to it when the
 * file was opened from there, else in its place.
 */
export function closeFile(groupId, { board = false } = {}) {
  const base = board ? paths.board(groupId) : paths.group(groupId);
  if (openedFrom === `#${base}`) history.back();
  else navigate(base, { replace: true });
}
/** Leave a group's whiteboard for its page: back to the page when the board was opened from it, else in its place. */
export function closeBoard(groupId) {
  if (boardFrom === `#${paths.group(groupId)}`) history.back();
  else navigate(paths.group(groupId), { replace: true });
}
/** The page a file was opened from (a file opened from its own group's page goes back to it on close). */
let openedFrom = null;
/** The page the whiteboard was opened from. */
let boardFrom = null;

export function useRoute() {
  const [route, setRoute] = useState(() => ({ ...parse(location.hash), key: keyOf(parse(location.hash)), scroll: 0 }));
  useEffect(() => {
    const onChange = () => {
      const from = current;
      if (!pushing) scrolls.set(current, window.scrollY);
      const scroll = pushing ? 0 : scrolls.get(location.hash || '#/') ?? 0;
      returned = !pushing;
      pushing = false;
      current = location.hash || '#/';
      const r = parse(location.hash);
      if (r.fileId && !parse(from).fileId) openedFrom = from;
      if (!r.fileId) openedFrom = null;
      if (r.board && !parse(from).board) boardFrom = from;
      if (!r.board) boardFrom = null;
      // within one page (its lightbox opening, stepping, closing) the page stays where it is
      const update = () => setRoute((prev) => (keyOf(r) === prev.key ? { ...r, key: prev.key, scroll: prev.scroll } : { ...r, key: keyOf(r), scroll }));
      // A new page is a transition: the old one stays until the new one is ready, and the two cross-fade. Within a
      // page it is not — a transition would snapshot the whole document, lifting the named top bar (and the page's
      // cover) above the lightbox until it ended; the lightbox animates itself.
      if (keyOf(r) === keyOf(parse(from))) update();
      else {
        // A file opening with its page (last viewed, random, a search result, Back / Forward) or a page left from a
        // file: the lightbox covers the page there, so this change is the lightbox's own — the room darkens over the
        // page being left (or lifts off the page arriving) and only the picture travels (base.css).
        const opening = !!r.fileId, closing = !!parse(from).fileId;
        if (opening || closing) holdRoot();
        startTransition(() => {
          if (opening) addTransitionType('file-open');
          if (closing) addTransitionType('file-close');
          update();
        });
      }
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useReleaseRoot(route);
  return route;
}

export const paths = {
  home: () => '/',
  group: (id) => `/group/${encodeURIComponent(id)}`,
  file: (groupId, fileId) => `/group/${encodeURIComponent(groupId)}/file/${encodeURIComponent(fileId)}`,
  board: (id) => `/group/${encodeURIComponent(id)}/board`,
  boardFile: (groupId, fileId) => `/group/${encodeURIComponent(groupId)}/board/file/${encodeURIComponent(fileId)}`,
};

/** An in-app link. Modified clicks fall through to the browser. */
export function Link({ to, children, onClick, ref, ...rest }) {
  return (
    <a
      ref={ref}
      href={`#${to}`}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

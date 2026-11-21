// Hash routing: #/ · #/group/:id · #/group/:id/file/:fileId (a file open in its group)
// Works from any folder the Go service serves the build from, and keeps back/forward native.
import { startTransition, useEffect, useState } from 'react';

function parse(hash) {
  const [a, b, c, d] = hash.replace(/^#\/?/, '').split('/');
  if (a === 'group' && b) return { name: 'group', id: decodeURIComponent(b), fileId: c === 'file' && d ? decodeURIComponent(d) : null };
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

export function navigate(path) {
  const next = `#${path}`;
  if (next === current) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  scrolls.set(current, window.scrollY);
  pushing = true;
  location.hash = path;
}

export function useRoute() {
  const [route, setRoute] = useState(() => ({ ...parse(location.hash), key: keyOf(parse(location.hash)), scroll: 0 }));
  useEffect(() => {
    const onChange = () => {
      if (!pushing) scrolls.set(current, window.scrollY);
      const scroll = pushing ? 0 : scrolls.get(location.hash || '#/') ?? 0;
      returned = !pushing;
      pushing = false;
      current = location.hash || '#/';
      const r = parse(location.hash);
      startTransition(() => setRoute({ ...r, key: keyOf(r), scroll }));
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const paths = {
  home: () => '/',
  group: (id) => `/group/${encodeURIComponent(id)}`,
  file: (groupId, fileId) => `/group/${encodeURIComponent(groupId)}/file/${encodeURIComponent(fileId)}`,
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

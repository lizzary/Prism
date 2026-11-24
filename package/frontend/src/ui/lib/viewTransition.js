// A document view transition (a page change, the theme's reveal) under way: work that cannot be seen during it waits
// for it to end, so the frames of the transition are not held up.

/** Is a view transition under way? */
export function inViewTransition() {
  try { return document.documentElement.matches(':active-view-transition'); } catch { return false; }
}

/** Run `fn` once no view transition is under way (at once if none is). → cancel */
export function afterViewTransition(fn) {
  let raf = 0;
  const check = () => { if (inViewTransition()) raf = requestAnimationFrame(check); else fn(); };
  check();
  return () => cancelAnimationFrame(raf);
}

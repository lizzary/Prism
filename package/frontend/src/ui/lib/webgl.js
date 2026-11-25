import { useSyncExternalStore } from 'react';

// Probe once per page. A context can still fail while compiling shaders or be lost later.
// In that case the open board and Settings should both see the same fallback immediately.
let cached = null;
const listeners = new Set();
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

export function boardContext(canvas) {
  const options = { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true };
  return canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options);
}

function webglAvailable() {
  if (cached == null) {
    try {
      const cv = document.createElement('canvas');
      const gl = boardContext(cv);
      cached = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { cached = false; }
  }
  return cached;
}

export const useWebGLAvailable = () => useSyncExternalStore(subscribe, webglAvailable);

export function reportWebGLFailure() {
  if (cached === false) return;
  cached = false;
  for (const listener of listeners) listener();
}

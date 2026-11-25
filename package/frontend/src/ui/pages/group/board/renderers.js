// Both renderers consume the same stage, scene, files, covers and interaction state.
import { DomRenderer } from './dom/DomRenderer.jsx';
import { WebGLRenderer } from './webgl/WebGLRenderer.jsx';

export const RENDERERS = { dom: DomRenderer, webgl: WebGLRenderer };

/** setting: 'auto' | 'webgl' | 'dom'; webgl: whether this device can draw with WebGL. → a key of RENDERERS */
export function pickRenderer(setting, webgl) {
  return webgl && setting !== 'dom' ? 'webgl' : 'dom';
}

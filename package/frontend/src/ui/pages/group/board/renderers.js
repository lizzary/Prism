// What draws the whiteboard's regions and cards. Everything else — the scene, the stage, the pointer, the headings and
// every panel — is the board's own and the same whichever draws it: a renderer takes { stage, scene, files, covers,
// look, layerRef } and draws (see dom/DomRenderer.jsx). Settings → Whiteboard renderer picks one: automatic (WebGL
// where the device can), WebGL, or DOM. The WebGL renderer comes in stage 4.2; until it does, every choice draws with
// the DOM.
import { DomRenderer } from './dom/DomRenderer.jsx';

export const RENDERERS = { dom: DomRenderer };

/** setting: 'auto' | 'webgl' | 'dom'; webgl: whether this device can draw with WebGL. → a key of RENDERERS */
export function pickRenderer(setting, webgl) {
  const wanted = setting === 'dom' ? 'dom' : setting === 'webgl' || webgl ? 'webgl' : 'dom';
  return RENDERERS[wanted] ? wanted : 'dom';
}

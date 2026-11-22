// Whether this browser can draw with WebGL — what "automatic" picks for the whiteboard. Asked once per session.
let cached = null;
export function webglAvailable() {
  if (cached == null) {
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2') ?? cv.getContext('webgl');
      cached = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { cached = false; }
  }
  return cached;
}

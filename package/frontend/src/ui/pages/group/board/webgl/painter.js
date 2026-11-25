import { boardContext } from '../../../../lib/webgl.js';
import { tiltDegrees } from '../cardAppearance.js';
import { CARD } from '../scene.js';
import { cardFragment, cardVertex, regionFragment, regionVertex } from './shaders.js';
import { createThumbnails } from './thumbnails.js';

function program(gl, vertex, fragment, attributes, names) {
  const p = gl.createProgram();
  const shaders = [];
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p, shader);
    }
    attributes.forEach((attr, i) => gl.bindAttribLocation(p, i, 'a_' + attr));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return { p, ...Object.fromEntries(names.split(' ').map((n) => [n, gl.getUniformLocation(p, 'u_' + n)])) };
  } catch (err) {
    gl.deleteProgram(p);
    throw err;
  } finally {
    shaders.forEach((shader) => gl.deleteShader(shader));
  }
}

const clear = [0, 0, 0, 0];
const rgba = (rgb, a) => [rgb[0], rgb[1], rgb[2], rgb[3] * a];
// CSS color-mix(in srgb, ...) interpolates premultiplied colours.
function mix(a, b, t) {
  const wa = a[3] * (1 - t), wb = b[3] * t, alpha = wa + wb;
  return alpha ? [(wa*a[0] + wb*b[0])/alpha, (wa*a[1] + wb*b[1])/alpha, (wa*a[2] + wb*b[2])/alpha, alpha] : clear;
}
const colors = new Map();
let colorSample;
function color(css) {
  if (colors.has(css)) return colors.get(css);
  let out;
  if (/^#[\da-f]{6}$/i.test(css)) {
    const n = parseInt(css.slice(1), 16);
    out = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  } else {
    // Tokens include translucent colours; imported group colours can use any CSS colour syntax.
    if (!colorSample) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      colorSample = c.getContext('2d', { willReadFrequently: true });
    }
    colorSample.clearRect(0, 0, 1, 1);
    colorSample.fillStyle = 'transparent';
    colorSample.fillStyle = css;
    colorSample.fillRect(0, 0, 1, 1);
    out = Array.from(colorSample.getImageData(0, 0, 1, 1).data, (n) => n / 255);
  }
  if (colors.size >= 4096) colors.clear();
  colors.set(css, out);
  return out;
}

function themeColors(canvas) {
  const style = getComputedStyle(canvas);
  const get = (name) => color(style.getPropertyValue('--' + name).trim());
  return {
    dark: document.documentElement.dataset.theme === 'dark', raised: get('bg-raised'),
    ink: get('ink'), ink3: get('ink-3'), ink4: get('ink-4'), line: get('line'), line2: get('line-2'),
    star: get('star'), soft: get('star-soft'), tone: rgba(mix(get('bg-sunken'), get('ink'), 5 / 90), .9),
  };
}

const MAX_BATCH = 1024;
const MAX_FRAME_PIXELS = 3840 * 2160;
const STRIDE = 20; // point, face transform/opacity, tone/saturation, state, atlas coordinates/fade
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** Draw regions in scene order, with a run of visible cards after each region. No card owns a DOM node. */
export function createPainter(canvas, redraw) {
  const gl = boardContext(canvas);
  if (!gl) throw new Error('WebGL unavailable');
  const regions = program(gl, regionVertex, regionFragment, ['corner'],
    'projection pixel rect padding shape detail base tint stroke halo shadow');
  let cards;
  try {
    cards = program(gl, cardVertex, cardFragment, ['point', 'surface', 'color', 'state', 'image', 'corner'],
      'projection pixel star starSoft frame crop dark far texture');
  } catch (err) { gl.deleteProgram(regions.p); throw err; }
  const instancing = gl.drawArraysInstanced ? {
    divisor: (attr, n) => gl.vertexAttribDivisor(attr, n),
    draw: (n) => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n),
  } : null;
  const quad = gl.createBuffer(), vertices = gl.createBuffer();
  const indices = instancing ? null : gl.createBuffer();
  // WebGL 2 uploads just one record per picture. WebGL 1 can draw the same ordered batch with indices.
  const copies = instancing ? 1 : 4;
  const data = new Float32Array(MAX_BATCH * copies * STRIDE);
  const cornerData = new Float32Array((instancing ? 1 : MAX_BATCH) * 8);
  const unit = CORNERS.flat();
  for (let i = 0; i < cornerData.length; i += 8) cornerData.set(unit, i);
  if (indices) {
    const order = new Uint16Array(MAX_BATCH * 6);
    for (let i = 0; i < MAX_BATCH; i++) {
      const a = i * 4;
      order.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, order, gl.STATIC_DRAW);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  // A sampler must be complete even on a frame containing only colour swatches.
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  const thumbs = createThumbnails(gl, redraw);
  const deviceLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const bufferLimit = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  let theme, cam, zoomX, zoomY, pixel, clock, frameRect, region, batchTexture, batchFar;
  let count = 0, active = null, fading = false;

  function use(p) {
    if (active === p) return;
    active = p;
    gl.useProgram(p.p);
    gl.uniform2f(p.projection, zoomX, zoomY);
    gl.uniform1f(p.pixel, pixel);
    if (p === regions) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      instancing?.divisor(0, 0);
      for (let i = 1; i < 6; i++) gl.disableVertexAttribArray(i);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      for (let i = 0; i < 5; i++) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
        instancing?.divisor(i, 1);
      }
      gl.uniform1f(p.dark, Number(theme.dark));
      gl.uniform4fv(p.star, theme.star);
      gl.uniform4fv(p.starSoft, theme.soft);
      gl.uniform1i(p.texture, 0);
    }
  }

  function flush() {
    if (!count) return;
    use(cards);
    gl.uniform4f(cards.frame, frameRect.x - cam.x, frameRect.y - cam.y, frameRect.w, frameRect.h);
    gl.uniform2f(cards.crop, +!!region.cropX, +!!region.cropY);
    gl.uniform1f(cards.far, +batchFar);
    gl.bindTexture(gl.TEXTURE_2D, batchTexture ?? blank);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * copies * STRIDE));
    if (instancing) instancing.draw(count);
    else gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_SHORT, 0);
    count = 0;
  }

  function box(x, y, w, h, { base = clear, tint = clear, stroke = clear, halo = clear, shadow = clear,
    radius = 16, width = 1, spread = 0, blur = 1, offset = 1, dash = 0, opacity = 1 }) {
    if (w <= 0 || h <= 0 || opacity <= 0) return;
    use(regions);
    gl.uniform1f(regions.padding, Math.max(2, pixel, spread + pixel, shadow[3] ? offset + blur + pixel : 0));
    gl.uniform4f(regions.rect, x - cam.x, y - cam.y, w, h);
    gl.uniform4f(regions.shape, radius, width, spread, blur);
    gl.uniform3f(regions.detail, dash, opacity, offset);
    gl.uniform4fv(regions.base, base); gl.uniform4fv(regions.tint, tint);
    gl.uniform4fv(regions.stroke, stroke); gl.uniform4fv(regions.halo, halo); gl.uniform4fv(regions.shadow, shadow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return {
    begin(camera, vp, now = performance.now()) {
      cam = camera;
      clock = now;
      // Preserve native 4K and 1080p at 2×, within this device's framebuffer limits.
      const width = Math.max(1, vp.w), height = Math.max(1, vp.h);
      const ratio = Math.min(devicePixelRatio || 1, Math.min(deviceLimit[0], bufferLimit) / width,
        Math.min(deviceLimit[1], bufferLimit) / height, Math.sqrt(MAX_FRAME_PIXELS / (width * height)));
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      // Implementations may allocate less than the requested size under memory pressure.
      const actualWidth = gl.drawingBufferWidth, actualHeight = gl.drawingBufferHeight;
      if (!actualWidth || !actualHeight) throw new Error('Cannot allocate whiteboard framebuffer');
      gl.viewport(0, 0, actualWidth, actualHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      zoomX = 2 * cam.z / width; zoomY = -2 * cam.z / height;
      pixel = 1 / (cam.z * Math.min(actualWidth / width, actualHeight / height));
      if (!theme || theme.dark !== (document.documentElement.dataset.theme === 'dark')) theme = themeColors(canvas);
      active = null; fading = false;
      thumbs.begin(CARD / pixel);
    },
    region(r, rect, look, opacity = 1) {
      flush();
      frameRect = rect;
      region = r;
      const c = r.color ? color(r.color) : theme.ink3;
      const hot = look.hotRegion === r.key, target = look.target === r.key;
      const style = { base: mix(theme.raised, c, theme.dark ? .07 : .08), tint: rgba(c, theme.dark ? .15 : .13),
        stroke: rgba(c, theme.dark ? .24 : .26), shadow: theme.dark ? clear : [.16,.13,.08,.04], opacity };
      if (r.plain || r.none) Object.assign(style, { base: mix(theme.raised, theme.ink, r.none ? .025 : .02),
        tint: clear, stroke: r.none ? theme.line2 : theme.line, width: r.none ? 1.5 : 1, dash: r.none ? 4.5 : 0 });
      if (hot && !r.none) Object.assign(style, { stroke: rgba(c,.52), width: 1.5, halo: rgba(c,.09), spread: 6 });
      if (hot && r.none) style.stroke = theme.ink4;
      if (target) Object.assign(style, { base: mix(theme.raised, r.none ? theme.star : c, r.none ? .09 : .16),
        tint: r.none ? clear : rgba(c,.22), stroke: r.none ? theme.star : rgba(c,.80), width: r.none ? 2 : 2.5,
        halo: rgba(c,.14), spread: 10, shadow: rgba(c,.16), offset: 14, blur: 18 });
      if (look.litRegions?.has(r.key)) Object.assign(style, { stroke: theme.star, width: 2, halo: theme.soft, spread: 7 });
      if (look.liftedRegion === r.key) Object.assign(style, { stroke: rgba(c,.60), width: 1.5, halo: clear,
        shadow: [0.08,0.06,0.04,theme.dark ? .65 : .32], blur: 28, offset: 22 });
      if (look.resizing === r.key) Object.assign(style, { stroke: rgba(c,.70), width: 1.5, halo: rgba(c,.1), spread: 6 });
      if (look.reached && !look.reached.has(r.key)) style.opacity *= .55;
      box(rect.x, rect.y, rect.w, rect.h, style);
      if (!r.n) box(rect.x + 16, rect.y + 52, rect.w - 32, rect.h - 68, {
        stroke: mix(theme.line2,c,.44), width: 1.5, radius: 9, dash: 4.5, opacity,
      });
    },
    card(file, x, y, tier, cover, look, motion = {}) {
      const far = tier === 'far', id = file.id;
      const thumb = far ? null : thumbs.get(file);
      const texture = thumb?.page.texture;
      if (count && ((texture && texture !== batchTexture) || far !== batchFar || count === MAX_BATCH)) flush();
      if (!count) { batchTexture = texture; batchFar = far; }
      const sel = look.selected.has(id), pre = !!look.preview?.has(id), hot = look.hot === id;
      const dim = look.lit && !look.lit.has(id), lit = !!look.lit?.has(id), carried = !!look.carried?.has(id);
      const near = tier === 'near';
      const flags = +sel + 2 * pre + 4 * lit + 8 * hot + 16 * (near && file.kind === 'video') +
        32 * (near && cover != null) + 64 * (near && cover === 0);
      const tone = file.tone ? color(file.tone) : theme.tone;
      const faceScale = motion.faceScale ?? (sel ? (far ? .66 : hot ? .84 : .8) : hot ? 1.04 : 1);
      const scale = Math.max(.001, (motion.scale ?? 1) * faceScale);
      const angle = motion.angle ?? (sel && !far ? tiltDegrees(id) * Math.PI / 180 : 0);
      const faceY = motion.faceY ?? (hot && !(sel && far) ? (sel ? -1 : -2) : 0);
      const fade = thumb ? Math.max(0, Math.min(1,(clock - thumb.at) / 360)) : 0;
      if (thumb && fade < 1) fading = true;
      const half = CARD / 2, pad = (hot || lit || motion.fresh) ? 20 : 4;
      const cx = x + half - cam.x, cy = y + half - cam.y;
      const i = count * copies * STRIDE;
      data[i] = cx; data[i+1] = cy; data[i+2] = half + pad; data[i+3] = tone[3];
      data[i+4] = scale; data[i+5] = angle; data[i+6] = faceY; data[i+7] = motion.opacity ?? 1;
      data[i+8] = tone[0]; data[i+9] = tone[1]; data[i+10] = tone[2];
      data[i+11] = motion.saturation ?? (dim ? .45 : carried ? .3 : 1);
      data[i+12] = flags; data[i+13] = motion.dimOpacity ?? (dim ? .3 : 1);
      data[i+14] = motion.carriedOpacity ?? (carried ? .28 : 1); data[i+15] = motion.fresh ?? 0;
      data[i+16] = thumb?.u ?? 0; data[i+17] = thumb?.v ?? 0; data[i+18] = thumb?.span ?? 0;
      data[i+19] = 1 - (1 - fade) ** 3;
      for (let j = 1; j < copies; j++) data.copyWithin(i + j * STRIDE, i, i + STRIDE);
      count++;
    },
    end() { flush(); thumbs.end(); if (fading) redraw(); },
    dispose() {
      thumbs.dispose();
      for (const b of [vertices, indices, quad]) if (b) gl.deleteBuffer(b);
      gl.deleteTexture(blank); gl.deleteProgram(cards.p); gl.deleteProgram(regions.p);
    },
  };
}

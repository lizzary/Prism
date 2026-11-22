// What the Go service does with real files, done in the browser for the mock: reading an uploaded picture's or
// video's size (and a video's poster frame), and turning a generated picture into a file worth downloading.
import { kindOfExt } from '../domain/files.js';

const once = (el, ok, fail = 'error') => new Promise((resolve, reject) => {
  const done = () => { el.removeEventListener(ok, done); el.removeEventListener(fail, bad); resolve(); };
  const bad = () => { el.removeEventListener(ok, done); el.removeEventListener(fail, bad); reject(new Error(fail)); };
  el.addEventListener(ok, done);
  el.addEventListener(fail, bad);
});

const extOf = (name) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');
const baseOf = (name) => (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name);

/** Pictures and videos only; anything else is left out. */
export function acceptable(file) {
  return file.type.startsWith('image/') || file.type.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'm4v'].includes(extOf(file.name));
}

/**
 * Read an uploaded file the way the import would: its kind, size in pixels, a video's length and a poster frame.
 * → { name, ext, kind, width, height, duration, size, createdAt, url, poster } | null
 */
export async function probe(file) {
  const ext = extOf(file.name) || (file.type.split('/')[1] ?? '');
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : kindOfExt(ext);
  const url = URL.createObjectURL(file);
  const common = { name: baseOf(file.name), ext, kind, size: file.size, createdAt: file.lastModified || Date.now(), url };
  try {
    if (kind === 'image') {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { ...common, width: img.naturalWidth || 1000, height: img.naturalHeight || 1000, duration: null, poster: url };
    }
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    await once(v, 'loadeddata');
    v.currentTime = Math.min(0.6, (v.duration || 1) / 3);
    await once(v, 'seeked');
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
    return { ...common, width: v.videoWidth || 1280, height: v.videoHeight || 720, duration: Math.round((v.duration || 0) * 10) / 10, poster: blob ? URL.createObjectURL(blob) : null };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/**
 * A file to hand to the browser's download: a generated picture is drawn at the file's own size in its own format,
 * so what lands on disk opens like the real thing. → a URL (to revoke once used)
 */
export async function renderDownload({ url, ext, width, height }) {
  if (!url.startsWith('data:image/svg')) {
    const blob = await (await fetch(url)).blob();
    return URL.createObjectURL(blob);
  }
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, 4096 / Math.max(width, height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(width * scale);
  cv.height = Math.round(height * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise((r) => cv.toBlob(r, MIME[ext] ?? 'image/png', 0.92));
  return URL.createObjectURL(blob);
}

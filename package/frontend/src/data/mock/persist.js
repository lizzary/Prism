// Stand-ins for the backend's storage: config.toml (app settings) and the per-database settings tables.
// Browser storage keeps the mock's settings across reloads; any failure just means starting fresh.

const CONFIG_KEY = 'prism.mock.config';
const SESSION_KEY = 'prism.mock.session';
const dbKey = (path) => `prism.mock.db:${path}`;

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory only */ }
}

export const DEFAULT_DB_PATH = 'D:\\Prism\\data';

/**
 * config.toml — English unless chosen otherwise; the first run follows the system's light or dark.
 * The mock keeps the password itself so it can check it; the Go service stores only a hash.
 * `?first-run` in the address shows the first-launch setup again.
 */
export function loadConfig() {
  const sysDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const cfg = read(CONFIG_KEY, {
    language: 'en', theme: sysDark ? 'dark' : 'light', dbPath: DEFAULT_DB_PATH,
    conflict: 'keep', gpu: true, whiteboard: 'auto', downloadName: null, models: null, indexing: null,
    setupDone: false,
    password: { enabled: false, secret: null, changedAt: null },
    server: { enabled: false },
    mcp: { enabled: false, keys: null },
  });
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('first-run')) cfg.setupDone = false;
  return cfg;
}
export const saveConfig = (cfg) => write(CONFIG_KEY, cfg);

/** Page settings (home and each group), the group order, the last viewed file and the last export setups of one database. */
export function loadDbPrefs(path) {
  return read(dbKey(path), { home: {}, groupOrder: null, lastViewed: null, views: {}, exports: {} });
}
export const saveDbPrefs = (path, prefs) => write(dbKey(path), prefs);

/** A signed-in browser tab (the Go service uses a session cookie). */
export function hasSession() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
export function setSession(on) {
  try { if (on) sessionStorage.setItem(SESSION_KEY, '1'); else sessionStorage.removeItem(SESSION_KEY); } catch { /* per page load only */ }
}

/**
 * `?image-search` in the address: the sample starts with an image index model downloaded and in use, and its pictures
 * indexed with it — so searching with words or with a picture works at once (see indexing.js).
 */
export function imageIndexReady() {
  try { return new URLSearchParams(location.search).has('image-search'); } catch { return false; }
}

// Stand-ins for the backend's storage: config.toml (app settings) and the per-database settings tables.
// Browser storage keeps the mock's settings across reloads; any failure just means starting fresh.

const CONFIG_KEY = 'prism.mock.config';
const dbKey = (path) => `prism.mock.db:${path}`;

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory only */ }
}

export const DEFAULT_DB_PATH = 'D:\\Prism\\data';

/** config.toml — English unless chosen otherwise; the first run follows the system's light or dark. */
export function loadConfig() {
  const sysDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return read(CONFIG_KEY, { language: 'en', theme: sysDark ? 'dark' : 'light', dbPath: DEFAULT_DB_PATH });
}
export const saveConfig = (cfg) => write(CONFIG_KEY, cfg);

/** Page settings (home and each group), the group order and the last viewed file of one database. */
export function loadDbPrefs(path) {
  return read(dbKey(path), { home: {}, groupOrder: null, lastViewed: null, views: {} });
}
export const saveDbPrefs = (path, prefs) => write(dbKey(path), prefs);

/** What the mock backend can do with its image index (`?image-search` in the address simulates a ready index). */
export function imageIndexReady() {
  try { return new URLSearchParams(location.search).has('image-search'); } catch { return false; }
}

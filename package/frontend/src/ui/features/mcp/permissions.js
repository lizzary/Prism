// Presets for MCP key permissions, and how a set of permissions reads back as one of them.
import { MCP_PERMISSIONS } from '../../../bridge/index.js';

export const CATEGORIES = Object.keys(MCP_PERMISSIONS);           // group · colorGroup · file

const build = (has) => Object.fromEntries(CATEGORIES.map((c) => [c, Object.fromEntries(MCP_PERMISSIONS[c].map((p) => [p, has(c, p)]))]));

export const PRESETS = {
  /** look, nothing else */
  read: () => build((c, p) => p === 'query'),
  /** look, tidy up details and sort pictures into colour groups — nothing is added or deleted */
  organize: () => build((c, p) => p === 'query' || p === 'edit' || (c === 'colorGroup' && p === 'create')),
  full: () => build(() => true),
};
export const PRESET_NAMES = Object.keys(PRESETS);

const same = (a, b) => CATEGORIES.every((c) => MCP_PERMISSIONS[c].every((p) => !!a[c]?.[p] === !!b[c]?.[p]));
export const presetOf = (perms) => PRESET_NAMES.find((name) => same(perms, PRESETS[name]())) ?? 'custom';

export const emptyPermissions = () => build(() => false);
export const anyPermission = (perms) => CATEGORIES.some((c) => Object.values(perms[c] ?? {}).some(Boolean));

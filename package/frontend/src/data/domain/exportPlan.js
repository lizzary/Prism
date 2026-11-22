// Export planning: which files are in scope, and where each one lands under the export folder.
//
// Scope = chosen groups ∩ import date range ∩ file types.
// Every file expands the template with its own values, so linked keys stay consistent by construction:
// in "group/colour group/…", each group's folder only ever holds that group's colour groups.
import { sanitizeValue, finishSegment, splitPath, uniqueName } from './filename.js';
import { resolveKey } from './keys.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** entries: [{ file, group, color }] in the gallery's order → the subset in scope, in export order. */
export function selectFiles(entries, { groupIds, dates, fileTypes }) {
  const groups = new Set(groupIds);
  const types = new Set(fileTypes.map((t) => t.toLowerCase()));
  const from = dates.mode === 'range' ? dates.from : null;
  const to = dates.mode === 'range' ? dates.to : null;
  return entries
    .filter(({ file, group }) => {
      if (!groups.has(group.id) || !types.has(file.ext.toLowerCase())) return false;
      const day = file.importedAt.slice(0, 10);
      return !from || (day >= from && day <= to);
    })
    // groups keep the gallery's order; inside a group, files come in the order they were imported
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.group === b.e.group ? a.e.file.importedAt.localeCompare(b.e.file.importedAt) || collator.compare(a.e.file.name, b.e.file.name) : a.i - b.i))
    .map(({ e }) => e);
}

/** One file's name (and folders) from a template. → { parts: [folder…], base } */
export function expandName(template, ctx) {
  let s = '';
  for (const tok of template) s += tok.type === 'text' ? tok.text : sanitizeValue(resolveKey(tok, ctx));
  const parts = splitPath(s).map((p) => finishSegment(p.trim()));
  let base = parts.pop() || '';
  const ext = ctx.file.ext;
  if (ext && base.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) base = base.slice(0, -(ext.length + 1));
  if (!base) base = sanitizeValue(ctx.file.name) || 'file';
  return { parts: parts.filter(Boolean), base };
}

/**
 * Lay the files out as a folder tree.
 * Returns { root, files, bytes, dirs }; root = { name, path, count, bytes, dirs: [...], files: [first maxPerDir], hidden }.
 */
export function planTree(entries, { template, lang, now, maxPerDir, rootName }) {
  const width = Math.max(3, String(entries.length).length);
  const mkDir = (name, path) => ({ name, path, dirs: new Map(), files: [], taken: new Set(), count: 0, bytes: 0 });
  const root = mkDir(rootName, '');
  let dirCount = 0;

  entries.forEach((entry, i) => {
    const { parts, base } = expandName(template, { ...entry, lang, now, seq: i + 1, width });
    let node = root;
    node.count++; node.bytes += entry.file.size;
    for (const d of parts) {
      const key = d.toLowerCase();
      let child = node.dirs.get(key);
      if (!child) { child = mkDir(d, `${node.path}/${d}`); node.dirs.set(key, child); dirCount++; }
      node = child;
      node.count++; node.bytes += entry.file.size;
    }
    node.files.push({ name: uniqueName(base, entry.file.ext, node.taken), size: entry.file.size, kind: entry.file.kind });
  });

  const out = (n) => ({
    name: n.name,
    path: n.path,
    count: n.count,
    bytes: n.bytes,
    dirs: [...n.dirs.values()].sort((a, b) => collator.compare(a.name, b.name)).map(out),
    files: n.files.slice(0, maxPerDir),
    hidden: Math.max(0, n.files.length - maxPerDir),
  });
  return { root: out(root), files: entries.length, bytes: root.bytes, dirs: dirCount };
}

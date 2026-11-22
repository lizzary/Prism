// File-name rules for export and download templates (Windows semantics, since the app ships as an .exe).
//
// A template is a list of tokens:
//   { type: 'text', text }                    free text; '/' and '\' separate folders (export templates only)
//   { type: 'key', kind: 'agg' | 'data', id } a key that expands per file

/** Characters that can never appear in a file name. Separators are handled separately. */
const ILLEGAL = /[<>:"|?*\u0000-\u001f]/g;
const ILLEGAL_OR_SEP = /[<>:"|?*\\/\u0000-\u001f]/g;
const SEP = /[\\/]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Remove the characters that cannot be typed into a template. `pathless` templates name a file and nothing more. */
export function stripIllegal(text, { pathless = false } = {}) {
  let removed = 0;
  const out = text.replace(pathless ? ILLEGAL_OR_SEP : ILLEGAL, () => { removed++; return ''; });
  return { text: out, removed };
}

const FULLWIDTH = { '<': '＜', '>': '＞', ':': '：', '"': '＂', '|': '｜', '?': '？', '*': '＊', '/': '／', '\\': '＼' };

/** Make an expanded value safe for one path segment (it never introduces a folder). */
export function sanitizeValue(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[<>:"|?*/\\]/g, (c) => FULLWIDTH[c])
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trailing dots and spaces are dropped by Windows; reserved device names get a suffix. */
export function finishSegment(seg) {
  let s = seg.replace(/[. ]+$/g, '');
  if (RESERVED.test(s)) s = `${s}_`;
  return s;
}

/**
 * Structural problems of a template. Returns [{ code }]:
 *   empty · absolute · dotSegment · emptySegment · noFileName · reserved · trailingDot
 */
export function validateTemplate(tokens) {
  const errors = [];
  const add = (code) => { if (!errors.some((e) => e.code === code)) errors.push({ code }); };
  if (!tokens.length || tokens.every((t) => t.type === 'text' && !t.text.trim())) { add('empty'); return errors; }
  // keys become a placeholder, so segments of plain text can be checked
  const KEY = '\u0001';
  const shape = tokens.map((t) => (t.type === 'key' ? KEY : t.text)).join('');
  if (SEP.test(shape[0])) add('absolute');
  const segs = shape.split(SEP);
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    const text = seg.trim();
    if (!text) {
      if (i === 0 && SEP.test(shape[0])) return;            // already reported as absolute
      add(last ? 'noFileName' : 'emptySegment');
      return;
    }
    if (!seg.includes(KEY)) {
      if (text === '.' || text === '..') add('dotSegment');
      else if (RESERVED.test(text)) add('reserved');
      else if (/[. ]$/.test(seg) && !last) add('trailingDot');
    }
  });
  return errors;
}

/** Split an expanded path into segments. */
export const splitPath = (s) => s.split(SEP);

/** "name(1).ext" style de-duplication (case-insensitive, like Windows). */
export function uniqueName(base, ext, taken) {
  const make = (n) => `${base}${n ? `(${n})` : ''}${ext ? `.${ext}` : ''}`;
  let n = 0;
  while (taken.has(make(n).toLowerCase())) n++;
  const name = make(n);
  taken.add(name.toLowerCase());
  return name;
}

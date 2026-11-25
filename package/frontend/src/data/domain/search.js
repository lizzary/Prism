// Gallery search. Each chosen domain is a place to look; the result is the union of what every domain finds.
//   tags · positive · negative   files whose tags / positive prompt / negative prompt hold the words
//   groups · colorGroups          files inside those groups / colour groups whose tags or positive prompt hold the words
//   semantic                      files the image index ranks for the words (text → pictures)
//   similar                       files the image index ranks for a picture (picture → pictures)
// Words separated by commas must all be found within the same domain ("starry sky, 1girl").
// Group and colour-group names that hold the words are found as well, as places to go.
// With no domain chosen, tags and positive prompts are searched.
import { norm } from './tags.js';

/** The words of a query: comma separated, case and width folded, underscores read as spaces. */
export const splitTerms = (text) => norm(text).split(/[,，、]/).map((s) => s.trim().replace(/[\s_]+/g, ' ')).filter(Boolean);

function rangesIn(hay, terms, max = 12) {
  const out = [];
  for (const t of terms) {
    let i = hay.indexOf(t);
    while (i !== -1 && out.length < max) { out.push([i, i + t.length]); i = hay.indexOf(t, i + t.length); }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** A window of the prompt around the first hit, with every hit inside it marked. */
function snippet(text, folded, terms, radius = 46) {
  const first = Math.min(...terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(first)) return null;
  const a = Math.max(0, first - radius), b = Math.min(text.length, first + radius * 2);
  const lead = a > 0 ? 1 : 0;
  const ranges = rangesIn(folded.slice(a, b), terms).map(([x, y]) => [x + lead, y + lead]);
  return { text: (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : ''), ranges };
}

/** The best tag for a word: an exact tag beats one that starts with it, which beats one that contains it. */
function tagFor(tags, t) {
  let best = null, rank = 0;
  for (const x of tags) {
    const r = x.key === t ? 3 : x.key.startsWith(t) ? 2 : x.key.includes(t) ? 1 : 0;
    if (r > rank) { best = x; rank = r; if (r === 3) break; }
  }
  return best ? { tag: best, rank } : null;
}

const NO_DOMAIN = (d) => !d.tags && !d.positive && !d.negative && !d.semantic && !d.similar && !d.groups.length && !d.colorGroups.length;

/**
 * docs: [{ id, groupId, colorIds: Set, tags: [{ key, label, source }], positive, negative, nPositive, nNegative, importedAt }]
 * domains: { tags, positive, negative, semantic, similar: bool, groups: [id], colorGroups: [id] }
 * ranked: { semantic?: Map(id → 0…1), similar?: Map(id → 0…1) } — what the image index found
 */
export function searchFiles(docs, text, domains, ranked = {}, limit = 180) {
  const terms = splitTerms(text);
  const D = NO_DOMAIN(domains) ? { ...domains, tags: true, positive: true } : domains;
  const inGroups = new Set(D.groups), inColors = new Set(D.colorGroups);
  const hits = [];

  for (const d of docs) {
    const matched = new Set();
    let score = 0, tagHit = null, prompt = null;
    if (terms.length) {
      const tagHits = terms.map((t) => tagFor(d.tags, t));
      const allTags = tagHits.every(Boolean);
      const allPos = terms.every((t) => d.nPositive.includes(t));
      const allNeg = terms.every((t) => d.nNegative.includes(t));
      const scoped = (inGroups.has(d.groupId) || [...d.colorIds].some((c) => inColors.has(c))) && (allTags || allPos);
      if ((D.tags || scoped) && allTags) { matched.add('tags'); score += tagHits.reduce((s, h) => s + [0, 3, 4, 6][h.rank], 0); tagHit = tagHits[0].tag; }
      if ((D.positive || scoped) && allPos) { matched.add('positive'); score += 2 * terms.length; prompt = { field: 'positive', ...snippet(d.positive, d.nPositive, terms) }; }
      if (D.negative && allNeg) { matched.add('negative'); score += terms.length; prompt ??= { field: 'negative', ...snippet(d.negative, d.nNegative, terms) }; }
    }
    const sem = D.semantic ? ranked.semantic?.get(d.id) : null;
    if (sem) { matched.add('semantic'); score += 5 * sem; }
    const sim = D.similar ? ranked.similar?.get(d.id) : null;
    if (sim) { matched.add('similar'); score += 5 * sim; }
    if (!matched.size) continue;
    hits.push({ d, score, matched: [...matched], tagHit, prompt, similarity: Math.max(sem ?? 0, sim ?? 0) || null });
  }
  hits.sort((a, b) => b.score - a.score || b.d.importedAt.localeCompare(a.d.importedAt));
  return {
    total: hits.length,
    files: hits.slice(0, limit).map(({ d, matched, tagHit, prompt, similarity }) => ({
      fileId: d.id, matched, similarity,
      tag: tagHit ? { label: tagHit.label, source: tagHit.source, ranges: rangesIn(norm(tagHit.label).replace(/_/g, ' '), terms) } : null,
      prompt: prompt?.text ? prompt : null,
    })),
  };
}

/**
 * Finding on a group's whiteboard: the files whose name, tags, positive or negative prompt hold every word (each
 * domain on its own, as above), and the colour groups whose name does — all of them, not a page of results.
 * docs: as for searchFiles (the group's files only) · names: Map(id → file name with extension) · colors: [{ id, name }]
 * → { files: [{ id, matched: ['name' | 'tags' | 'positive' | 'negative'] }], colorGroups: [id] }
 */
export function findOnBoard(docs, names, colors, text) {
  const terms = splitTerms(text);
  if (!terms.length) return { files: [], colorGroups: [] };
  const all = (hay) => terms.every((t) => hay.includes(t));
  const files = [];
  for (const d of docs) {
    const matched = [];
    if (all(norm(names.get(d.id) ?? '').replace(/[\s_]+/g, ' '))) matched.push('name');
    if (terms.every((t) => tagFor(d.tags, t))) matched.push('tags');
    if (all(d.nPositive)) matched.push('positive');
    if (all(d.nNegative)) matched.push('negative');
    if (matched.length) files.push({ id: d.id, matched });
  }
  const colorGroups = colors.filter((c) => all(norm(c.name).replace(/[\s_]+/g, ' '))).map((c) => c.id);
  return { files, colorGroups };
}

/** Places whose name holds the whole query (groups, colour groups). */
export function searchNames(items, text, limit = 8) {
  const q = norm(text.trim());
  if (!q) return [];
  return items
    .map((it) => ({ it, at: norm(it.name).indexOf(q) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at || a.it.name.length - b.it.name.length)
    .slice(0, limit)
    .map(({ it, at }) => ({ ...it, ranges: [[at, at + q.length]] }));
}

// Tags. The tagger writes booru-style names (long_hair, star_(sky)); people type whatever they like.
// A tag's key is its normalised name, so "Long Hair", "long_hair" and "long hair" are the same tag.

export const norm = (s) => (s || '').normalize('NFKC').toLowerCase();

/** The key a tag is stored and matched under. */
export const tagKey = (name) => norm(name).trim().replace(/[\s_]+/g, ' ');

/** How a tag reads on screen: underscores become spaces, the rest is kept as written. */
export const tagLabel = (name) => String(name).replace(/_/g, ' ').trim();

/**
 * The tags of one file as shown: the model's tags ∪ the user's own, each once.
 * A user tag that repeats a model tag keeps the model's (the user added nothing new).
 */
export function mergeTags(modelTags, userTags) {
  const seen = new Set();
  const out = [];
  for (const t of modelTags) { const k = tagKey(t.name); if (!seen.has(k)) { seen.add(k); out.push({ ...t, key: k, source: 'model' }); } }
  for (const name of userTags) { const k = tagKey(name); if (!seen.has(k)) { seen.add(k); out.push({ name, key: k, source: 'user' }); } }
  return out;
}

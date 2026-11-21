// The generated gallery behind the mock backend. Deterministic: the same day always produces the same gallery.
import { seeded } from '../domain/random.js';
import { figureTags } from './art.js';
import {
  GROUPS, STYLE_TAGS, PALETTE_TAGS, EXTRA_TAGS, LONG_TAIL, USER_TAGS, NOTES, MODELS, SAMPLERS, SCHEDULERS, QUALITY, PHRASES, NEGATIVE, NEGATIVE_EXTRA,
} from './content.js';

// ------------------------------------------------------------------ dates
const pad = (n, k = 2) => String(n).padStart(k, '0');
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** A moment `days` (may be fractional) before now. */
export const ago = (days) => isoOf(new Date(Date.now() - days * 86_400_000));
export function daysAgo(n, h = 12, m = 0) {
  const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() - n);
  return isoOf(d.getTime() > Date.now() ? new Date(Date.now() - 3_600_000) : d);
}

// ------------------------------------------------------------------ files
const CUTS = ['long_hair', 'short_hair', 'twintails', 'ponytail'];
const FLUX_SENTENCES = {
  stilllife: 'a quiet still life of a vase of flowers and a cup on a sunlit table, soft window light, muted colors',
  portrait: 'an illustration of a girl in a sailor uniform, gentle smile, petals drifting, soft backlight, clean line art',
  sea: 'a calm sea at golden hour, the sun low over the horizon, long reflections on the water, minimal composition',
  cat: 'a cat sitting by a window in the afternoon sun, warm light on the floor, cozy room, flat illustration',
  bokeh: 'abstract city lights out of focus, large soft bokeh circles, dark background, dreamy mood',
};

function pickWeighted(r, weights) {
  const x = r();
  let acc = 0;
  for (let j = 0; j < weights.length; j++) { acc += weights[j]; if (x < acc) return j; }
  return -1;
}

/** The tagger's view of a picture: tags with confidence, strongest first. */
function modelTags(q, art, w, h) {
  const out = new Map();
  const add = (name, score) => { if (name && !out.has(name)) out.set(name, Math.round(score * 1000) / 1000); };
  const S = STYLE_TAGS[art.style];
  for (const t of S.always) add(t, q.range(0.82, 0.99));
  for (const t of figureTags(art.seed, art.style, art.palette, w, h)) add(t, q.range(0.68, 0.97));
  for (const t of q.shuffle(S.some).slice(0, q.int(3, 7))) add(t, q.range(0.38, 0.86));
  for (const t of q.shuffle(PALETTE_TAGS[art.palette]).slice(0, q.int(1, 2))) add(t, q.range(0.36, 0.72));
  for (const t of q.shuffle(EXTRA_TAGS).slice(0, q.int(0, 3))) add(t, q.range(0.35, 0.55));
  for (let k = q.int(0, 4); k > 0; k--) add(q.pick(LONG_TAIL), q.range(0.35, 0.6));
  return [...out].map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score);
}

function comfyOf(q, spec, tags, art, i) {
  const family = spec.family;
  const words = tags.filter((t) => t.score > 0.5).slice(0, q.int(8, 16)).map((t) => t.name.replace(/_/g, ' '));
  const positive = family === 'flux'
    ? `${FLUX_SENTENCES[art.style] ?? 'a serene landscape, soft light, muted colors'}, ${q.shuffle(PHRASES).slice(0, 2).join(', ')}`
    : [...q.shuffle(QUALITY).slice(0, q.int(2, 4)), ...words, ...q.shuffle(PHRASES).slice(0, q.int(1, 3))].join(', ');
  return {
    model: q.pick(MODELS[family]),
    seed: Math.floor(q() * 2 ** 32) * 1024 + q.int(0, 1023),
    positive,
    negative: family === 'flux' ? '' : [...NEGATIVE.slice(0, q.int(8, NEGATIVE.length)), ...q.shuffle(NEGATIVE_EXTRA).slice(0, q.int(0, 4))].join(', '),
    sampler: family === 'flux' ? 'euler' : q.pick(SAMPLERS),
    scheduler: family === 'flux' ? q.pick(['simple', 'beta']) : q.pick(SCHEDULERS),
    steps: family === 'flux' ? q.int(20, 30) : q.int(24, 40),
    cfg: family === 'flux' ? 1 : Math.round(q.range(4.5, 7.5) * 2) / 2,
    denoise: spec.hires && i % 2 ? q.pick([0.35, 0.4, 0.45, 0.5]) : 1,
  };
}

function fileName(q, spec, i, n, ext, createdAt) {
  const day = createdAt.slice(0, 10).replace(/-/g, '');
  switch (spec.kind) {
    case 'comfy': return `ComfyUI_${pad(n, 5)}_`;
    case 'pixiv': return `${90_000_000 + q.int(0, 39_999_999)}_p${q.chance(0.7) ? 0 : q.int(1, 4)}`;
    case 'fanbox': return `${spec.handle}_${day}_${pad(q.int(1, 12))}`;
    case 'video': return ext === 'webm' ? `loop_${pad(n, 3)}` : `AnimateDiff_${pad(n, 5)}`;
    default: return q.pick([
      `IMG_${q.int(1000, 9999)}`, `wallpaper_${pad(q.int(1, 140), 3)}`, `Screenshot ${createdAt.slice(0, 10)} ${pad(q.int(8, 23))}${pad(q.int(0, 59))}${pad(q.int(0, 59))}`,
      `image (${q.int(1, 60)})`, `illust_${day}_${pad(i % 100)}`, `ref_${pad(q.int(1, 300), 3)}`,
    ]);
  }
}

/**
 * One file of a group. `cover` (optional) forces the picture's size and style, for the group's cover.
 * Files are numbered newest first: index 0 is the most recent.
 */
export function buildFile(spec, group, i, id, cover) {
  const q = seeded(`${spec.key}|file|${i}`);
  const video = !cover && spec.video ? q.chance(spec.video) : false;
  const [w, h] = cover ? spec.cover : q.pick(spec.dims);
  const art = { seed: `${spec.key}-${i}`, style: cover ? spec.coverStyle : q.pick(spec.styles), palette: q.pick(spec.palettes) };
  // creation dates spread over the group's age, newest first; imports follow a few days later, in batches
  const t = spec.count > 1 ? i / (spec.count - 1) : 0;
  const age = spec.age[0] + (spec.age[1] - spec.age[0]) * Math.pow(t, 1.15) + q.range(0, 0.9);
  const createdAt = ago(age + q.range(0.2, 0.6));
  const importedAt = ago(Math.max(spec.imported + q.range(0.01, 0.3), age - q.range(0, 3)));
  const ext = video ? (q.chance(0.3) ? 'webm' : 'mp4') : spec.kind === 'comfy' ? 'png' : q.pick(['png', 'jpg', 'jpg', 'webp']);
  const name = fileName(q, spec, i, 120 + spec.count - i, ext, createdAt);
  const tags = modelTags(q, art, w, h);
  const duration = video ? Math.round(q.range(3, 28) * 10) / 10 : null;
  const size = video
    ? Math.round(duration * q.range(0.5, 1.4) * 1_048_576 * (w * h) / (1920 * 1080))
    : Math.round(w * h * (ext === 'png' ? q.range(1.1, 1.9) : q.range(0.25, 0.55)));
  const userTags = [];
  if (spec.userTag) userTags.push(spec.userTag);
  if (q.chance(spec.user ?? 0)) {
    userTags.push(q.chance(0.35) ? q.pick(['精选', '喜欢']) : q.pick(USER_TAGS));
    if (q.chance(0.3)) userTags.push(q.pick(USER_TAGS));
  }
  if (spec.key === 'starry' && q.chance(0.3)) userTags.push('系列 · 星夜');
  const colors = {};
  (spec.configs ?? []).forEach((c, k) => {
    let j = -1;
    if (c.by === 'palette') j = c.map[art.palette] ?? -1;
    else if (c.by === 'cut') j = CUTS.findIndex((cut) => tags.some((x) => x.name === cut));
    else j = pickWeighted(q, c.weights);
    if (j >= 0) colors[group.configs[k].id] = group.configs[k].groups[j].id;
  });
  return {
    id, groupId: group.id, name, ext, kind: video ? 'video' : 'image', width: w, height: h, size, duration,
    createdAt, importedAt, art, tags, userTags: [...new Set(userTags)],
    note: q.chance(0.05) ? q.pick(NOTES) : '',
    comfy: spec.kind === 'comfy' && !video ? comfyOf(q, spec, tags, art, i) : null,
    colors,
  };
}

// ------------------------------------------------------------------ groups
export function groupRecord(spec) {
  const id = `g_${spec.key}`;
  const configs = (spec.configs ?? []).map((c, k) => ({
    id: `${id}_c${k}`, name: c.name,
    groups: c.groups.map(([name, color], j) => ({ id: `${id}_c${k}_${j}`, name, color })),
  }));
  return { id, key: spec.key, name: spec.name, createdAt: daysAgo(spec.created, 20, 10), coverFileId: null, configs, activeConfigId: configs[0]?.id ?? null };
}

/** The whole seeded gallery. */
export function seedLibrary() {
  let fileSeq = 1;
  const nextFileId = () => `f_${fileSeq++}`;
  const groups = [], files = [];
  for (const spec of GROUPS) {
    const g = groupRecord(spec);
    const coverAt = spec.count ? Math.min(spec.count - 1, seeded(`cover|${spec.key}`).int(0, 6)) : -1;
    for (let i = 0; i < spec.count; i++) {
      const f = buildFile(spec, g, i, nextFileId(), i === coverAt);
      if (i === coverAt) g.coverFileId = f.id;
      files.push(f);
    }
    groups.push(g);
  }
  return { groups, files, nextFileId, specs: Object.fromEntries(GROUPS.map((s) => [`g_${s.key}`, s])) };
}

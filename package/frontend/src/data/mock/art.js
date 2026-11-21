// Generated artwork standing in for the pictures in the mock gallery.
// Every picture is a deterministic SVG (seeded), served as a data URI, so the mock gallery works offline.
import { seeded } from '../domain/random.js';

export const PALETTES = {
  dusk: { sky: ['#f6d5c3', '#e9a6a6'], layers: ['#c98b9a', '#9e6c8f', '#6d5182', '#3f3a63'], sun: '#fff1d6', accent: '#f2b880', paper: '#f7ede4', ink: '#2f2a46' },
  dawn: { sky: ['#fde9d6', '#f7c8b0'], layers: ['#e3b5a4', '#c9918f', '#8f6f7f', '#5a4e66'], sun: '#fffaf0', accent: '#e98c7a', paper: '#fbf3ea', ink: '#3b3346' },
  mint: { sky: ['#e3f1ea', '#bfe0d4'], layers: ['#9ccbbb', '#6fae9f', '#3f8580', '#245c5e'], sun: '#fffbe9', accent: '#f4c27a', paper: '#eef6f1', ink: '#1d3f45' },
  lagoon: { sky: ['#d7ecf2', '#a9d3e0'], layers: ['#7fb6ca', '#5592ad', '#346f8e', '#1f4a66'], sun: '#fff6dc', accent: '#f0a35e', paper: '#eaf4f6', ink: '#183447' },
  lavender: { sky: ['#ece6f4', '#d3c6e8'], layers: ['#b8a6d6', '#9483be', '#6b5f9c', '#463f71'], sun: '#fff8ec', accent: '#f1b3c4', paper: '#f3eff8', ink: '#2d2747' },
  sakura: { sky: ['#fdebef', '#f6cdd8'], layers: ['#ecaebf', '#d9899f', '#b46a86', '#7d4d68'], sun: '#fffaf3', accent: '#f7d38a', paper: '#fdf3f5', ink: '#4a2f3f' },
  forest: { sky: ['#eef0dc', '#d5dcb6'], layers: ['#a9bd8e', '#7f9a6c', '#56744f', '#344d38'], sun: '#fff6d8', accent: '#e8a865', paper: '#f4f3e6', ink: '#24352a' },
  amber: { sky: ['#fbe9c8', '#f3cc8e'], layers: ['#e5ab6a', '#c9854f', '#9a5d3f', '#5f3b31'], sun: '#fff8e6', accent: '#7fa0b8', paper: '#fbf2e2', ink: '#3c271f' },
  night: { sky: ['#1f2a4d', '#3d4f80'], layers: ['#3a4c7c', '#2a3c68', '#1d2c52', '#131d38'], sun: '#f6e7b4', accent: '#e8c46a', paper: '#e9e6dc', ink: '#0f1730' },
  slate: { sky: ['#eef1f4', '#d8dee6'], layers: ['#b6c0cc', '#8d9aab', '#637387', '#3d4b5e'], sun: '#ffffff', accent: '#d97d6a', paper: '#f2f4f6', ink: '#263241' },
  peach: { sky: ['#fff0e3', '#ffd9c2'], layers: ['#f5b99c', '#e8957c', '#c9746a', '#8f5560'], sun: '#fffaf0', accent: '#8fb8a8', paper: '#fff6ee', ink: '#4b2f37' },
  sage: { sky: ['#f1f3ea', '#dfe5d3'], layers: ['#c3cfb4', '#a1b394', '#7c9275', '#566b57'], sun: '#fffdf2', accent: '#e2a1a1', paper: '#f5f6ef', ink: '#2f3a31' },
  deep: { sky: ['#16324f', '#2c5576'], layers: ['#2e5b78', '#234a66', '#173750', '#0e263a'], sun: '#f3e6c0', accent: '#f0b36b', paper: '#e5ebef', ink: '#0c1d2c' },
};

const f1 = (n) => Math.round(n * 10) / 10;
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };

/** Catmull-Rom → cubic Bézier path through pts. */
function smoothD(pts) {
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}

const ridge = (r, w, base, amp, steps = 18) => {
  const a = r.range(1, 2.4), b = r.range(3, 6.5), p = r() * 6.3, q = r() * 6.3;
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    pts.push([t * w, base - amp * Math.sin(t * a * Math.PI + p) - amp * 0.35 * Math.sin(t * b * Math.PI + q)]);
  }
  return pts;
};

const sky = (w, h, P, extra = '') => `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky[0]}"/><stop offset="1" stop-color="${P.sky[1]}"/></linearGradient>${extra}</defs><rect width="${w}" height="${h}" fill="url(#s)"/>`;
const stars = (r, w, h, n, top = 0.55, color = '#f6efd2') => {
  let s = '';
  for (let k = 0; k < n; k++) s += `<circle cx="${f1(r() * w)}" cy="${f1(r() * h * top)}" r="${f1(r.range(0.6, 2.2) * Math.min(w, h) / 600)}" fill="${color}" opacity="${f1(r.range(0.35, 0.95))}"/>`;
  return s;
};

function sun(r, w, h, P, yMax = 0.42) {
  const m = Math.min(w, h), sr = m * r.range(0.07, 0.12);
  const x = w * r.range(0.16, 0.84), y = h * r.range(0.14, yMax);
  return { x, y, r: sr, svg: `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sr * 2.3)}" fill="${P.sun}" opacity=".16"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sr * 1.5)}" fill="${P.sun}" opacity=".22"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sr)}" fill="${P.sun}"/>` };
}

/** A figure drawn in a 100 × 100 box, placed so its foot sits on the bottom edge. */
const placed = (x, y, size, inner) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${(size / 100).toFixed(4)})">${inner}</g>`;

// ------------------------------------------------------------------ a character, from the shoulders up
// What a figure looks like comes from its own seed, so the tagger in the mock can name exactly what is drawn.
const HAIR = [['#2d2b3a', 'black'], ['#4a3a3c', 'black'], ['#7a5446', 'brown'], ['#e2c58e', 'blonde'], ['#d9dae3', 'grey'], ['#e6a8b8', 'pink'], ['#86a4d6', 'blue'], ['#a993cf', 'purple'], ['#c9705e', 'red']];
const EYES = [['#4a6fa5', 'blue'], ['#9a4b5c', 'red'], ['#4f8062', 'green'], ['#6b5aa0', 'purple'], ['#b4823c', 'brown'], ['#c0565e', 'red'], ['#3f8c94', 'aqua']];
const CUTS = ['long_hair', 'short_hair', 'twintails', 'ponytail'];
function bustLook(key) {
  const q = seeded(`${key}|look`);
  return { hair: q.int(0, HAIR.length - 1), eye: q.int(0, EYES.length - 1), cut: q.int(0, 3), shut: q.chance(0.14), ornament: q.chance(0.6) };
}

function bust(r, P, L) {
  const hair = HAIR[L.hair][0], eye = EYES[L.eye][0], cloth = r.pick([P.layers[3], P.ink, P.layers[2]]);
  const skin = '#f8e6d8', shade = '#ecd0c0', collar = '#fbf7ee', ribbon = r.pick([P.accent, '#c4555f', '#3f5a8f']);
  let g = '';
  if (L.cut === 0) g += `<path d="M26 42C24 16 76 16 74 42C77 62 81 82 79 100H62C64 84 62 68 58 60H42C38 68 36 84 38 100H21C19 82 23 62 26 42Z" fill="${hair}"/>`;
  if (L.cut === 1) g += `<path d="M27 42C25 17 75 17 73 42C75 52 74 62 70 69H30C26 62 25 52 27 42Z" fill="${hair}"/>`;
  if (L.cut === 2) g += `<ellipse cx="21" cy="58" rx="8" ry="25" fill="${hair}" transform="rotate(9 21 58)"/><ellipse cx="79" cy="58" rx="8" ry="25" fill="${hair}" transform="rotate(-9 79 58)"/><path d="M27 42C25 17 75 17 73 42C75 50 74 58 71 62H29C26 58 25 50 27 42Z" fill="${hair}"/>`;
  if (L.cut === 3) g += `<path d="M69 29C88 34 90 62 81 82C79 66 75 53 66 45Z" fill="${hair}"/><path d="M27 42C25 17 75 17 73 42C75 52 74 60 71 64H29C26 60 25 52 27 42Z" fill="${hair}"/>`;
  g += `<path d="M12 100C14 86 26 77 40 75H60C74 77 86 86 88 100Z" fill="${cloth}"/>`;
  g += `<path d="M44.5 58h11v18h-11Z" fill="${shade}"/>`;
  g += `<path d="M38 75.4 50 88.5 62 75.4 58 74.2H42Z" fill="${collar}"/>`;
  g += `<path d="M50 86 42.6 82.2l1 8.6ZM50 86l7.4-3.8-1 8.6Z" fill="${ribbon}"/><circle cx="50" cy="86.2" r="1.9" fill="${ribbon}"/>`;
  g += `<ellipse cx="50" cy="43" rx="18.5" ry="20.5" fill="${skin}"/>`;
  g += `<path d="M30.5 41C29 24 39 16.5 50 16.5S71 24 69.5 41L66.5 33.5 63 41.5 58.5 30.5 53.5 40 49 29.5 44.5 39.5 40 31 35 40.5 33 35Z" fill="${hair}"/>`;
  for (const ex of [42.2, 57.8]) {
    if (L.shut) { g += `<path d="M${ex - 3.6} 47q3.6 2.6 7.2 0" fill="none" stroke="#3a2a2e" stroke-width="1.4" stroke-linecap="round"/>`; continue; }
    g += `<ellipse cx="${ex}" cy="46.6" rx="3.5" ry="4.6" fill="${eye}"/><ellipse cx="${ex}" cy="48.2" rx="2.3" ry="2.3" fill="#000" opacity=".16"/><circle cx="${ex + 1.1}" cy="44.9" r="1.35" fill="#fff"/>`;
    g += `<path d="M${ex - 4.4} 43q4.4-3 8.8 0" fill="none" stroke="#3a2a2e" stroke-width="1.3" stroke-linecap="round"/>`;
  }
  g += `<ellipse cx="36.4" cy="53" rx="3.4" ry="2" fill="#f19a9a" opacity=".38"/><ellipse cx="63.6" cy="53" rx="3.4" ry="2" fill="#f19a9a" opacity=".38"/>`;
  g += `<path d="M47.6 56.4q2.4 1.8 4.8 0" fill="none" stroke="#b06a6a" stroke-width="1.1" stroke-linecap="round"/>`;
  if (L.ornament) {
    const c = r.pick([P.accent, '#fbf7ee', '#f2c94c']);
    g += `<g transform="translate(64.5 25.5) rotate(${r.int(-20, 20)})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-2.6" rx="1.7" ry="2.7" fill="${c}" transform="rotate(${a})"/>`).join('')}<circle r="1.2" fill="${P.ink}" opacity=".5"/></g>`;
  }
  return g;
}

// ------------------------------------------------------------------ a cat, sitting
const FUR = [['#f1dfc6', '#e7c9a4', null], ['#8f8a8f', '#77727a', 'grey_cat'], ['#2e2c33', '#1f1e24', 'black_cat'], ['#e0975c', '#c97a42', 'orange_cat'], ['#f7f3ec', '#e9e2d6', 'white_cat']];
const CAT_EYES = [['#d8c25a', 'yellow'], ['#9cc26a', 'green'], ['#7fb2c9', 'blue'], ['#e0a046', 'orange']];
function catLook(key) {
  const q = seeded(`${key}|look`);
  return { fur: q.int(0, FUR.length - 1), eye: q.int(0, CAT_EYES.length - 1) };
}

function catFigure(L) {
  const [fur, dark] = FUR[L.fur], eye = CAT_EYES[L.eye][0];
  let g = `<ellipse cx="50" cy="95" rx="30" ry="4" fill="#000" opacity=".12"/>`;
  g += `<path d="M66 91C88 92 94 74 84 62" fill="none" stroke="${dark}" stroke-width="7" stroke-linecap="round"/>`;
  g += `<path d="M29 93C25 70 33 51 50 49C67 51 75 70 71 93Z" fill="${fur}"/>`;
  if (L.fur === 3) g += `<path d="M36 64q14 5 28 0M34 74q16 5 32 0M34 84q16 4 32 0" fill="none" stroke="${dark}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
  g += `<path d="M34 33 31.5 15 45.5 26.5ZM66 33l2.5-18-14 11.5Z" fill="${fur}"/><path d="M35.5 29 34.4 20.2l6.6 5.6ZM64.5 29l1.1-8.8-6.6 5.6Z" fill="#e9a3a3" opacity=".8"/>`;
  g += `<ellipse cx="50" cy="39" rx="17.5" ry="15" fill="${fur}"/>`;
  for (const ex of [43, 57]) g += `<ellipse cx="${ex}" cy="38.5" rx="3" ry="3.6" fill="${eye}"/><ellipse cx="${ex}" cy="38.5" rx=".9" ry="2.8" fill="#1d1b20"/><circle cx="${ex + 0.9}" cy="37.2" r=".8" fill="#fff"/>`;
  g += `<path d="M48.4 45h3.2L50 47Z" fill="#d98c8c"/><path d="M50 47q-2 2.4-4 1.4M50 47q2 2.4 4 1.4" fill="none" stroke="#5a4a4a" stroke-width=".9" stroke-linecap="round"/>`;
  g += `<path d="M28 44h10M29 48.5l9-1.5M72 44H62M71 48.5l-9-1.5" stroke="#5a4a4a" stroke-opacity=".45" stroke-width=".9" stroke-linecap="round"/>`;
  g += `<ellipse cx="43.5" cy="92" rx="5" ry="3.2" fill="${fur}"/><ellipse cx="56.5" cy="92" rx="5" ry="3.2" fill="${fur}"/>`;
  return g;
}

/** What a tagger would name in the figure of a picture (a character or a cat): drawn and named from one seed. */
export function figureTags(seed, style, palette, w, h) {
  const key = `${seed}|${style}|${palette}|${w}x${h}`;
  if (style === 'portrait') {
    const L = bustLook(key);
    return [`${HAIR[L.hair][1]}_hair`, CUTS[L.cut], L.shut ? 'closed_eyes' : `${EYES[L.eye][1]}_eyes`, ...(L.shut ? [] : ['looking_at_viewer']), ...(L.ornament ? ['hair_flower'] : [])];
  }
  if (style === 'cat') {
    const L = catLook(key);
    return [FUR[L.fur][2], `${CAT_EYES[L.eye][1]}_eyes`, ...(L.fur === 3 ? ['tabby_cat'] : [])].filter(Boolean);
  }
  return [];
}

// ------------------------------------------------------------------ styles
const STYLES = {
  hills(r, w, h, P) {
    let s = sky(w, h, P) + sun(r, w, h, P).svg;
    const n = P.layers.length;
    P.layers.forEach((c, i) => {
      s += `<path d="${smoothD(ridge(r, w, h * (0.5 + i * (0.42 / n)), h * r.range(0.04, 0.08)))}L${w} ${h}L0 ${h}Z" fill="${c}"/>`;
    });
    if (r.chance(0.6)) {                                    // a few birds
      for (let k = 0; k < r.int(2, 4); k++) {
        const x = w * r.range(0.2, 0.8), y = h * r.range(0.12, 0.36), b = Math.min(w, h) * r.range(0.012, 0.022);
        s += `<path d="M${f1(x - b)} ${f1(y)}q${f1(b / 2)} ${f1(-b * 0.6)} ${f1(b)} 0q${f1(b / 2)} ${f1(-b * 0.6)} ${f1(b)} 0" fill="none" stroke="${P.ink}" stroke-opacity=".55" stroke-width="${f1(b * 0.22)}" stroke-linecap="round"/>`;
      }
    }
    return s;
  },
  moonlit(r, w, h, P) {
    const N = PALETTES.night;
    let s = sky(w, h, N) + stars(r, w, h, 40);
    const m = Math.min(w, h), mx = w * r.range(0.55, 0.8), my = h * r.range(0.2, 0.32), mr = m * 0.16;
    s += `<circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr * 1.9)}" fill="${N.sun}" opacity=".08"/><circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" fill="${P.sun === '#ffffff' ? N.sun : P.sun}"/>`;
    const hill = ridge(r, w, h * 0.78, h * 0.05, 14);
    s += `<path d="${smoothD(ridge(r, w, h * 0.68, h * 0.05))}L${w} ${h}L0 ${h}Z" fill="${N.layers[1]}"/>`;
    s += `<path d="${smoothD(hill)}L${w} ${h}L0 ${h}Z" fill="${N.layers[3]}"/>`;
    // a small figure and a cat sitting on the hill, looking at the moon
    const k = Math.round(14 * r.range(0.3, 0.45)), [fx, fy] = hill[k], u = m / 120;
    s += `<g fill="${N.layers[3]}"><circle cx="${f1(fx)}" cy="${f1(fy - 11 * u)}" r="${f1(2.6 * u)}"/><path d="M${f1(fx - 3.4 * u)} ${f1(fy + 1)}q${f1(0.2 * u)} ${f1(-8.6 * u)} ${f1(3.4 * u)} ${f1(-8.6 * u)}q${f1(3.2 * u)} 0 ${f1(3.6 * u)} ${f1(8.6 * u)}z"/>`
      + `<path d="M${f1(fx + 6 * u)} ${f1(fy + 1)}q0 ${f1(-3.4 * u)} ${f1(1.8 * u)} ${f1(-3.6 * u)}l${f1(0.3 * u)} ${f1(-1.4 * u)}l${f1(0.8 * u)} ${f1(1.1 * u)}l${f1(0.8 * u)} ${f1(-1.1 * u)}l${f1(0.3 * u)} ${f1(1.4 * u)}q${f1(1.6 * u)} ${f1(0.4 * u)} ${f1(1.4 * u)} ${f1(3.6 * u)}z"/></g>`;
    return s;
  },
  sea(r, w, h, P) {
    const hz = h * r.range(0.52, 0.62);
    const sn = sun(r, w, hz, P, 0.7);
    let s = sky(w, h, P) + sn.svg;
    s += `<rect y="${f1(hz)}" width="${w}" height="${f1(h - hz)}" fill="${P.layers[2]}"/>`;
    s += `<rect y="${f1(hz)}" width="${w}" height="${f1((h - hz) * 0.35)}" fill="${P.layers[1]}" opacity=".7"/>`;
    for (let k = 0; k < 9; k++) {                           // the sun's broken reflection
      const y = hz + (h - hz) * (0.06 + k * 0.1), ww = sn.r * (2.2 - k * 0.18) * r.range(0.7, 1.2);
      s += `<rect x="${f1(sn.x - ww / 2)}" y="${f1(y)}" width="${f1(ww)}" height="${f1(Math.max(2, (h - hz) * 0.022))}" rx="2" fill="${P.sun}" opacity="${f1(0.75 - k * 0.06)}"/>`;
    }
    for (let k = 0; k < 14; k++) {
      const y = hz + (h - hz) * r.range(0.15, 0.95), x = r() * w, l = w * r.range(0.03, 0.08);
      s += `<path d="M${f1(x)} ${f1(y)}h${f1(l)}" stroke="${P.layers[0]}" stroke-opacity=".5" stroke-width="${f1(Math.max(1.5, h / 300))}" stroke-linecap="round"/>`;
    }
    if (r.chance(0.5)) {                                    // a far island
      const x0 = w * r.range(0.05, 0.6), iw = w * r.range(0.18, 0.32);
      s += `<path d="M${f1(x0)} ${f1(hz)}q${f1(iw * 0.3)} ${f1(-h * 0.06)} ${f1(iw * 0.55)} ${f1(-h * 0.04)}q${f1(iw * 0.25)} ${f1(h * 0.01)} ${f1(iw * 0.45)} ${f1(h * 0.04)}z" fill="${P.layers[3]}" opacity=".75"/>`;
    }
    return s;
  },
  botanic(r, w, h, P) {
    let s = `<rect width="${w}" height="${h}" fill="${P.paper}"/>`;
    const m = Math.min(w, h);
    s += `<circle cx="${f1(w * r.range(0.3, 0.7))}" cy="${f1(h * r.range(0.3, 0.55))}" r="${f1(m * r.range(0.28, 0.4))}" fill="${P.sky[1]}" opacity=".7"/>`;
    const stems = r.int(3, 5);
    for (let k = 0; k < stems; k++) {
      const x0 = w * (0.2 + 0.6 * ((k + r.range(0.2, 0.8)) / stems)), x1 = x0 + w * r.range(-0.12, 0.12);
      const y1 = h * r.range(0.18, 0.5);
      const cx = (x0 + x1) / 2 + w * r.range(-0.1, 0.1);
      s += `<path d="M${f1(x0)} ${f1(h)}Q${f1(cx)} ${f1((h + y1) / 2)} ${f1(x1)} ${f1(y1)}" fill="none" stroke="${P.layers[3]}" stroke-width="${f1(m * 0.008)}" stroke-linecap="round"/>`;
      for (let j = 0; j < r.int(2, 4); j++) {               // leaves
        const t = r.range(0.25, 0.8), lx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, ly = (1 - t) * (1 - t) * h + 2 * (1 - t) * t * ((h + y1) / 2) + t * t * y1;
        const side = j % 2 ? 1 : -1, ll = m * r.range(0.07, 0.12), ang = side * r.range(30, 60);
        s += `<ellipse cx="${f1(lx + side * ll * 0.5)}" cy="${f1(ly)}" rx="${f1(ll * 0.55)}" ry="${f1(ll * 0.2)}" fill="${P.layers[2]}" transform="rotate(${f1(-ang)} ${f1(lx)} ${f1(ly)})"/>`;
      }
      const pr = m * r.range(0.035, 0.06), petals = r.int(5, 8), col = r.pick([P.accent, P.layers[0], P.layers[1]]);
      for (let j = 0; j < petals; j++) {
        const a = (j / petals) * 360 + r.range(0, 10);
        s += `<ellipse cx="${f1(x1)}" cy="${f1(y1 - pr)}" rx="${f1(pr * 0.55)}" ry="${f1(pr)}" fill="${col}" transform="rotate(${f1(a)} ${f1(x1)} ${f1(y1)})"/>`;
      }
      s += `<circle cx="${f1(x1)}" cy="${f1(y1)}" r="${f1(pr * 0.45)}" fill="${P.sun === '#ffffff' ? P.accent : P.ink}" opacity=".85"/>`;
    }
    return s;
  },
  bauhaus(r, w, h, P) {
    const cols = r.int(3, 5), cell = w / cols, rows = Math.ceil(h / cell);
    const C = [P.layers[0], P.layers[1], P.layers[2], P.layers[3], P.accent, P.sky[1], P.paper];
    let s = `<rect width="${w}" height="${h}" fill="${P.paper}"/>`;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * cell, y = j * cell, bg = r.pick(C);
      let fg = r.pick(C); if (fg === bg) fg = P.ink;
      s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(cell + 0.5)}" height="${f1(cell + 0.5)}" fill="${bg}"/>`;
      const kind = r.int(0, 4), rot = r.int(0, 3) * 90, cxp = x + cell / 2, cyp = y + cell / 2;
      const g = (inner) => `<g transform="rotate(${rot} ${f1(cxp)} ${f1(cyp)})">${inner}</g>`;
      if (kind === 0) s += g(`<path d="M${f1(x)} ${f1(y + cell)}A${f1(cell)} ${f1(cell)} 0 0 1 ${f1(x + cell)} ${f1(y)}L${f1(x + cell)} ${f1(y + cell)}Z" fill="${fg}"/>`);
      else if (kind === 1) s += `<circle cx="${f1(cxp)}" cy="${f1(cyp)}" r="${f1(cell * 0.32)}" fill="${fg}"/>`;
      else if (kind === 2) s += g(`<path d="M${f1(x)} ${f1(cyp)}A${f1(cell / 2)} ${f1(cell / 2)} 0 0 1 ${f1(x + cell)} ${f1(cyp)}Z" fill="${fg}"/>`);
      else if (kind === 3) s += g(`<path d="M${f1(x)} ${f1(y + cell)}L${f1(cxp)} ${f1(y)}L${f1(x + cell)} ${f1(y + cell)}Z" fill="${fg}"/>`);
      else s += `<rect x="${f1(x + cell * 0.22)}" y="${f1(y + cell * 0.22)}" width="${f1(cell * 0.56)}" height="${f1(cell * 0.56)}" fill="${fg}"/>`;
    }
    return s;
  },
  waves(r, w, h, P) {
    let s = sky(w, h, P);
    const rows = r.int(6, 9), band = (h * 0.62) / rows, R = band * 0.95;
    for (let j = 0; j < rows; j++) {
      const y = h * 0.38 + j * band, c = P.layers[Math.min(3, Math.floor((j / rows) * 4))];
      const off = (j % 2) * R;
      let d = `M0 ${f1(h)}L0 ${f1(y + R)}`;
      for (let x = -off; x < w + 2 * R; x += 2 * R) d += `A${f1(R)} ${f1(R)} 0 0 1 ${f1(x + 2 * R)} ${f1(y + R)}`;
      s += `<path d="${d}L${w} ${f1(h)}Z" fill="${c}"/>`;
      for (let x = -off; x < w + 2 * R; x += 2 * R) s += `<path d="M${f1(x + R * 0.35)} ${f1(y + R)}A${f1(R * 0.65)} ${f1(R * 0.65)} 0 0 1 ${f1(x + R * 1.65)} ${f1(y + R)}" fill="none" stroke="${P.paper}" stroke-opacity=".55" stroke-width="${f1(R * 0.08)}"/>`;
    }
    return s + sun(r, w, h * 0.5, P, 0.6).svg.replace(/opacity="\.(16|22)"/g, 'opacity=".12"');
  },
  town(r, w, h, P) {
    const N = PALETTES.night;
    let s = sky(w, h, N) + stars(r, w, h, 50, 0.5);
    const mx = w * r.range(0.12, 0.88), my = h * r.range(0.12, 0.26), mr = Math.min(w, h) * 0.07;
    s += `<circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" fill="${N.sun}"/><circle cx="${f1(mx - mr * 0.35)}" cy="${f1(my - mr * 0.2)}" r="${f1(mr * 0.9)}" fill="${N.sky[0]}"/>`;
    let x = -r.range(0, 20);
    while (x < w) {
      const bw = w * r.range(0.06, 0.12), bh = h * r.range(0.22, 0.48), y = h - bh;
      const c = r.pick([N.layers[2], N.layers[3], N.layers[1]]);
      s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw + 1)}" height="${f1(bh)}" fill="${c}"/>`;
      if (r.chance(0.4)) s += `<path d="M${f1(x)} ${f1(y)}L${f1(x + bw / 2)} ${f1(y - bw * 0.45)}L${f1(x + bw)} ${f1(y)}Z" fill="${c}"/>`;
      const ww = bw / 7;
      for (let yy = y + ww * 1.4; yy < h - ww * 2; yy += ww * 2.2) for (let xx = x + ww; xx < x + bw - ww; xx += ww * 2) {
        if (r.chance(0.45)) s += `<rect x="${f1(xx)}" y="${f1(yy)}" width="${f1(ww)}" height="${f1(ww * 1.3)}" fill="${r.chance(0.8) ? P.accent : N.sun}" opacity="${f1(r.range(0.6, 1))}"/>`;
      }
      x += bw;
    }
    return s;
  },
  portrait(r, w, h, P, key) {
    let s = sky(w, h, P);
    const tall = h >= w * 0.9;
    const B = tall ? Math.min(w * 1.02, h * 0.84) : h * 0.9;
    const cx = (tall ? w * 0.5 : w * r.pick([0.3, 0.7])) + w * r.range(-0.03, 0.03);
    // a soft light behind the head, and a few petals drifting through the frame
    s += `<circle cx="${f1(cx)}" cy="${f1(h - B * 0.6)}" r="${f1(B * 0.42)}" fill="${P.sun}" opacity=".5"/><circle cx="${f1(cx)}" cy="${f1(h - B * 0.6)}" r="${f1(B * 0.3)}" fill="${P.sun}" opacity=".45"/>`;
    const m = Math.min(w, h);
    for (let k = 0; k < r.int(6, 14); k++) {
      const px = r() * w, py = r() * h * 0.85, pr = m * r.range(0.008, 0.02);
      s += `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(pr)}" ry="${f1(pr * 0.6)}" fill="${r.pick([P.accent, P.layers[0], '#ffffff'])}" opacity="${f1(r.range(0.45, 0.9))}" transform="rotate(${r.int(0, 180)} ${f1(px)} ${f1(py)})"/>`;
    }
    if (!tall) s += `<path d="${smoothD(ridge(r, w, h * 0.86, h * 0.03))}L${w} ${h}L0 ${h}Z" fill="${P.layers[1]}" opacity=".55"/>`;
    return s + placed(cx - B / 2, h - B, B, bust(r, P, bustLook(key)));
  },
  cat(r, w, h, P, key) {
    const floor = h * r.range(0.68, 0.78);
    let s = `<rect width="${w}" height="${h}" fill="${P.paper}"/>`;
    // a window on the wall, with the sky outside
    const ww = w * r.range(0.26, 0.4), wh = Math.min(floor * 0.7, ww * 1.3), wx = w * r.range(0.08, 0.92) - ww / 2, wy = floor * 0.12;
    s += `<rect x="${f1(wx)}" y="${f1(wy)}" width="${f1(ww)}" height="${f1(wh)}" rx="${f1(ww * 0.04)}" fill="${P.sky[1]}"/>`;
    s += `<circle cx="${f1(wx + ww * 0.68)}" cy="${f1(wy + wh * 0.32)}" r="${f1(ww * 0.12)}" fill="${P.sun}"/>`;
    s += `<path d="M${f1(wx + ww / 2)} ${f1(wy)}v${f1(wh)}M${f1(wx)} ${f1(wy + wh / 2)}h${f1(ww)}" stroke="${P.paper}" stroke-width="${f1(ww * 0.035)}"/>`;
    s += `<rect x="${f1(wx - ww * 0.05)}" y="${f1(wy + wh)}" width="${f1(ww * 1.1)}" height="${f1(ww * 0.05)}" fill="${P.layers[1]}"/>`;
    // light from the window lying on the floor
    s += `<rect y="${f1(floor)}" width="${w}" height="${f1(h - floor)}" fill="${P.layers[0]}"/>`;
    s += `<path d="M${f1(wx)} ${f1(floor)}h${f1(ww)}l${f1(ww * 0.5)} ${f1(h - floor)}h${f1(-ww)}Z" fill="${P.sun}" opacity=".35"/>`;
    const B = Math.min(w, h) * r.range(0.5, 0.64), cx = w * r.range(0.3, 0.7);
    return s + placed(cx - B / 2, floor + (h - floor) * 0.55 - B * 0.95, B, catFigure(catLook(key)));
  },
  aurora(r, w, h) {
    let s = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1730"/><stop offset=".7" stop-color="#1c3456"/><stop offset="1" stop-color="#2b4a68"/></linearGradient>`;
    const BANDS = r.shuffle([['#7fe0c0', '#3fa59a'], ['#a7f0a0', '#58b07f'], ['#c2a8f0', '#7b6bc0'], ['#8fd4f0', '#4f8fc0']]).slice(0, r.int(2, 3));
    BANDS.forEach(([a], i) => { s += `<linearGradient id="a${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}" stop-opacity="0"/><stop offset=".55" stop-color="${a}" stop-opacity=".55"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient>`; });
    s += `</defs><rect width="${w}" height="${h}" fill="url(#s)"/>${stars(r, w, h, 70, 0.7)}`;
    BANDS.forEach((_, i) => {
      const top = ridge(r, w, h * r.range(0.16, 0.34), h * r.range(0.04, 0.09), 12), th = h * r.range(0.16, 0.26);
      const bottom = top.map(([x, y]) => [x, y + th * (0.7 + 0.3 * Math.sin(x / w * 7 + i))]).reverse();
      s += `<path d="${smoothD(top)}L${f1(bottom[0][0])} ${f1(bottom[0][1])}${smoothD(bottom).slice(1).replace(/^[\d.\s-]+/, '')}Z" fill="url(#a${i})"/>`;
    });
    s += `<path d="${smoothD(ridge(r, w, h * 0.7, h * 0.08, 10))}L${w} ${h}L0 ${h}Z" fill="#14243c"/>`;
    s += `<path d="${smoothD(ridge(r, w, h * 0.82, h * 0.03, 10))}L${w} ${h}L0 ${h}Z" fill="#dfe8ee"/>`;
    s += `<path d="${smoothD(ridge(r, w, h * 0.9, h * 0.02, 10))}L${w} ${h}L0 ${h}Z" fill="#c9d6e0"/>`;
    return s;
  },
  bokeh(r, w, h, P) {
    let s = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(P.layers[3], '#000000', 0.35)}"/><stop offset="1" stop-color="${P.layers[3]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/>`;
    const m = Math.min(w, h), C = [P.accent, P.sun, P.layers[0], P.sky[1]];
    for (let k = 0; k < r.int(36, 60); k++) {
      const cx = r() * w, cy = h * (0.15 + 0.8 * Math.pow(r(), 0.8)), rr = m * r.range(0.02, 0.11), c = r.pick(C);
      s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rr)}" fill="${c}" opacity="${f1(r.range(0.1, 0.42))}"/>`;
      if (r.chance(0.35)) s += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rr * 0.92)}" fill="none" stroke="${c}" stroke-width="${f1(rr * 0.08)}" opacity=".35"/>`;
    }
    return s;
  },
  pixel(r, w, h, P) {
    const n = r.int(36, 52), c = Math.max(w, h) / n, cols = Math.ceil(w / c), rows = Math.ceil(h / c);
    let s = '';
    const band = (y0, y1, col) => { s += `<rect y="${f1(y0 * c)}" width="${f1(w)}" height="${f1((y1 - y0) * c + 0.5)}" fill="${col}"/>`; };
    const skyRows = Math.round(rows * 0.62);
    for (let k = 0; k < 5; k++) band(Math.round(skyRows * k / 5), Math.round(skyRows * (k + 1) / 5), mix(P.sky[0], P.sky[1], k / 4));
    const sx = r.int(4, cols - 6), sy = r.int(3, Math.max(4, Math.round(skyRows * 0.4))), sr = r.int(2, 4);
    for (let j = -sr; j <= sr; j++) { const half = Math.round(Math.sqrt(sr * sr - j * j + 0.5)); s += `<rect x="${f1((sx - half) * c)}" y="${f1((sy + j) * c)}" width="${f1((half * 2 + 1) * c)}" height="${f1(c + 0.5)}" fill="${P.sun}"/>`; }
    for (let k = 0; k < r.int(1, 3); k++) {                // blocky clouds
      const cx0 = r.int(0, cols - 8), cy0 = r.int(1, Math.max(2, skyRows - 6)), cw = r.int(4, 8);
      s += `<rect x="${f1(cx0 * c)}" y="${f1(cy0 * c)}" width="${f1(cw * c)}" height="${f1(c)}" fill="#ffffff" opacity=".85"/><rect x="${f1((cx0 + 1) * c)}" y="${f1((cy0 - 1) * c)}" width="${f1((cw - 3) * c)}" height="${f1(c)}" fill="#ffffff" opacity=".85"/>`;
    }
    const steps = (base, amp, col) => {                       // a stepped skyline, one path
      let d = `M0 ${f1(h)}`;
      const a = r.range(0.15, 0.35), b = r() * 6;
      for (let i = 0; i <= cols; i++) { const y = Math.round(base - amp * (0.5 + 0.5 * Math.sin(i * a + b)) - amp * 0.4 * Math.sin(i * a * 2.7 + b)); d += `V${f1(y * c)}H${f1((i + 1) * c)}`; }
      s += `<path d="${d}V${f1(h)}Z" fill="${col}"/>`;
    };
    steps(skyRows + 1, rows * 0.22, P.layers[1]);
    steps(skyRows + 5, rows * 0.12, P.layers[2]);
    for (let k = 0; k < r.int(3, 6); k++) {                // pines
      const tx = r.int(1, cols - 3), base = rows - r.int(3, 6), th = r.int(4, 7);
      for (let j = 0; j < th; j++) { const half = Math.floor((th - j) / 2.2); s += `<rect x="${f1((tx - half) * c)}" y="${f1((base - j) * c)}" width="${f1((half * 2 + 1) * c)}" height="${f1(c + 0.5)}" fill="${P.layers[3]}"/>`; }
    }
    band(rows - 3, rows + 1, P.layers[3]);
    return s;
  },
  stilllife(r, w, h, P) {
    const table = h * r.range(0.6, 0.7), m = Math.min(w, h);
    let s = `<rect width="${w}" height="${h}" fill="${P.paper}"/>`;
    // window light falling across the wall and onto the table
    const lx = w * r.range(0.5, 0.72);
    s += `<path d="M${f1(lx)} 0h${f1(w * 0.3)}l${f1(-w * 0.2)} ${f1(table)}h${f1(-w * 0.3)}Z" fill="${P.sun}" opacity=".6"/>`;
    s += `<rect y="${f1(table)}" width="${w}" height="${f1(h - table)}" fill="${P.layers[1]}"/><rect y="${f1(table)}" width="${w}" height="${f1(m * 0.014)}" fill="${P.layers[2]}"/>`;
    s += `<path d="M${f1(lx - w * 0.2)} ${f1(table)}h${f1(w * 0.3)}l${f1(-w * 0.12)} ${f1(h - table)}h${f1(-w * 0.3)}Z" fill="${P.sun}" opacity=".25"/>`;
    // a vase of flowers, a cup, a piece of fruit
    const vx = w * r.range(0.34, 0.44), vw = m * 0.24, vh = m * 0.36, top = table - vh * 0.86;
    s += `<ellipse cx="${f1(vx + vw * 0.5)}" cy="${f1(table + m * 0.022)}" rx="${f1(vw * 0.95)}" ry="${f1(m * 0.022)}" fill="#000" opacity=".12"/>`;
    const blooms = r.int(5, 7);
    for (let k = 0; k < blooms; k++) {
      const a = -Math.PI / 2 + (k - (blooms - 1) / 2) * 0.3 + r.range(-0.08, 0.08), len = vh * r.range(0.75, 1.2);
      const ex = vx + Math.cos(a) * len * 0.62, ey = top + Math.sin(a) * len * 0.72;
      s += `<path d="M${f1(vx)} ${f1(top + vh * 0.1)}Q${f1(vx + (ex - vx) * 0.25)} ${f1(ey + vh * 0.35)} ${f1(ex)} ${f1(ey)}" fill="none" stroke="${P.layers[3]}" stroke-width="${f1(m * 0.008)}" stroke-linecap="round"/>`;
      if (r.chance(0.5)) s += `<ellipse cx="${f1((vx + ex) / 2 + m * 0.025)}" cy="${f1((top + ey) / 2 + vh * 0.12)}" rx="${f1(m * 0.03)}" ry="${f1(m * 0.012)}" fill="${P.layers[2]}" transform="rotate(-30 ${f1((vx + ex) / 2 + m * 0.025)} ${f1((top + ey) / 2 + vh * 0.12)})"/>`;
      const br = m * r.range(0.038, 0.06), col = r.pick([P.accent, P.layers[0], '#fbf7ee']);
      for (let j = 0; j < 6; j++) s += `<circle cx="${f1(ex + Math.cos(j * 1.047) * br * 0.62)}" cy="${f1(ey + Math.sin(j * 1.047) * br * 0.62)}" r="${f1(br * 0.5)}" fill="${col}"/>`;
      s += `<circle cx="${f1(ex)}" cy="${f1(ey)}" r="${f1(br * 0.32)}" fill="${P.ink}" opacity=".55"/>`;
    }
    s += `<path d="M${f1(vx - vw * 0.2)} ${f1(top)}h${f1(vw * 0.4)}c0 ${f1(vh * 0.2)} ${f1(vw * 0.32)} ${f1(vh * 0.3)} ${f1(vw * 0.32)} ${f1(vh * 0.6)}c0 ${f1(vh * 0.16)} ${f1(-vw * 0.22)} ${f1(vh * 0.26)} ${f1(-vw * 0.52)} ${f1(vh * 0.26)}s${f1(-vw * 0.52)} ${f1(-vh * 0.1)} ${f1(-vw * 0.52)} ${f1(-vh * 0.26)}c0 ${f1(-vh * 0.3)} ${f1(vw * 0.32)} ${f1(-vh * 0.4)} ${f1(vw * 0.32)} ${f1(-vh * 0.6)}Z" fill="${P.layers[2]}"/>`;
    s += `<path d="M${f1(vx - vw * 0.06)} ${f1(top + vh * 0.32)}c${f1(-vw * 0.2)} ${f1(vh * 0.12)} ${f1(-vw * 0.24)} ${f1(vh * 0.3)} ${f1(-vw * 0.16)} ${f1(vh * 0.46)}" fill="none" stroke="#ffffff" stroke-opacity=".3" stroke-width="${f1(m * 0.012)}" stroke-linecap="round"/>`;
    const cx = vx + vw * r.range(0.9, 1.3), cw = m * 0.17, ch = m * 0.12;
    s += `<ellipse cx="${f1(cx)}" cy="${f1(table + m * 0.012)}" rx="${f1(cw * 0.85)}" ry="${f1(m * 0.02)}" fill="${mix(P.layers[0], '#ffffff', 0.4)}"/>`;
    s += `<path d="M${f1(cx - cw / 2)} ${f1(table - ch)}h${f1(cw)}l${f1(-cw * 0.08)} ${f1(ch * 0.9)}q0 ${f1(ch * 0.1)} ${f1(-cw * 0.1)} ${f1(ch * 0.1)}h${f1(-cw * 0.64)}q${f1(-cw * 0.1)} 0 ${f1(-cw * 0.1)} ${f1(-ch * 0.1)}Z" fill="#fbf7ee"/>`;
    s += `<ellipse cx="${f1(cx)}" cy="${f1(table - ch)}" rx="${f1(cw / 2)}" ry="${f1(m * 0.012)}" fill="${mix(P.layers[3], '#6b4a3a', 0.5)}"/>`;
    s += `<path d="M${f1(cx + cw / 2 - cw * 0.04)} ${f1(table - ch * 0.78)}c${f1(cw * 0.32)} 0 ${f1(cw * 0.32)} ${f1(ch * 0.48)} 0 ${f1(ch * 0.48)}" fill="none" stroke="#fbf7ee" stroke-width="${f1(m * 0.014)}"/>`;
    if (r.chance(0.75)) {
      const fx = vx - vw * r.range(0.9, 1.3), fr = m * 0.055;
      s += `<circle cx="${f1(fx)}" cy="${f1(table - fr * 0.8)}" r="${f1(fr)}" fill="${P.accent}"/><path d="M${f1(fx)} ${f1(table - fr * 1.75)}q${f1(fr * 0.2)} ${f1(-fr * 0.4)} ${f1(fr * 0.5)} ${f1(-fr * 0.5)}" fill="none" stroke="${P.layers[3]}" stroke-width="${f1(m * 0.008)}" stroke-linecap="round"/>`;
    }
    return s;
  },
};

const cache = new Map();
const toUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** An artwork as a data URI. w/h set the aspect (the picture is drawn at ~1200 px on its long side). */
export function artwork(seed, style, palette, w, h) {
  const key = `${seed}|${style}|${palette}|${w}x${h}`;
  let uri = cache.get(key);
  if (!uri) {
    const k = 1200 / Math.max(w, h), W = Math.round(w * k), H = Math.round(h * k);
    const body = STYLES[style](seeded(key), W, H, PALETTES[palette], key);
    uri = toUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`);
    cache.set(key, uri);
  }
  return uri;
}

/** The colour a picture reads as from a distance (for "similar pictures"). */
export function paletteTone(palette) {
  const P = PALETTES[palette];
  return hx(mix(P.sky[1], P.layers[1], 0.5));
}

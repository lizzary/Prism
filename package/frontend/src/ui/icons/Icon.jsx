// Prism's own icon set: 24 × 24 grid, round line work, drawn to sit with the rounded type.
// Use <Icon name="search" /> — size follows font-size unless `size` is given; colour follows currentColor.

const f = (n) => n.toFixed(2);

/** A turning spiral (the sky of the home page) with an arrowhead on its outer arm. */
function spiral() {
  const T = 2.55 * Math.PI, r0 = 1.3, r1 = 7.9, a0 = Math.PI * 0.62, pts = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * T, r = r0 + (r1 - r0) * Math.pow(t / T, 0.92), a = a0 + t;
    pts.push([12 + r * Math.cos(a), 12 + r * Math.sin(a)]);
  }
  const [x, y] = pts[pts.length - 1], [px, py] = pts[pts.length - 4];
  const ang = Math.atan2(y - py, x - px), h = 3.4;
  const w1 = [x - h * Math.cos(ang - 0.62), y - h * Math.sin(ang - 0.62)], w2 = [x - h * Math.cos(ang + 0.62), y - h * Math.sin(ang + 0.62)];
  return `<path d="M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}"/><path d="M${f(w1[0])} ${f(w1[1])}L${f(x)} ${f(y)}L${f(w2[0])} ${f(w2[1])}"/>`;
}

/** A soft eight-tooth gear. */
function gear() {
  const n = 8, R = 9.2, r = 7.1, d = [];
  for (let k = 0; k < n; k++) {
    const c = (k / n) * Math.PI * 2 - Math.PI / 2;
    const p = (a, rad) => `${f(12 + rad * Math.cos(a))} ${f(12 + rad * Math.sin(a))}`;
    d.push(`${k ? 'L' : 'M'}${p(c - 0.3, r)}L${p(c - 0.17, R)}L${p(c + 0.17, R)}L${p(c + 0.3, r)}A${r} ${r} 0 0 1 ${p(c + (Math.PI * 2) / n - 0.3, r)}`);
  }
  return `<path d="${d.join('')}Z"/><circle cx="12" cy="12" r="2.9"/>`;
}

const TAG = 'M4.2 12.3V5.7a1.5 1.5 0 0 1 1.5-1.5h6.6a1.5 1.5 0 0 1 1.06.44l6.3 6.3a1.5 1.5 0 0 1 0 2.12l-6.6 6.6a1.5 1.5 0 0 1-2.12 0l-6.3-6.3A1.5 1.5 0 0 1 4.2 12.3Z';

const I = {
  search: '<circle cx="11" cy="11" r="6.4"/><path d="m15.8 15.8 4.4 4.4"/>',
  spiral: spiral(),
  refresh: '<path d="M19.4 9.2A7.6 7.6 0 0 0 5.3 8.1"/><path d="M4.6 14.8a7.6 7.6 0 0 0 14.1 1.1"/><path d="M19.6 4.6v4.8h-4.8"/><path d="M4.4 19.4v-4.8h4.8"/>',
  export: '<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14"/><path d="M14 4.5h5.5V10"/><path d="m19.5 4.5-8 8"/>',
  download: '<path d="M12 4v11.2"/><path d="m7.6 11 4.4 4.4 4.4-4.4"/><path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>',
  upload: '<path d="M12 15.5V4.3"/><path d="m7.6 8.6 4.4-4.4 4.4 4.4"/><path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"/>',
  import: '<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14"/><path d="M11.5 7v5.5H17"/><path d="m19.5 4.5-8 8"/>',
  tasks: '<path d="M9.5 6.5h10"/><path d="M9.5 12h10"/><path d="M9.5 17.5h6"/><circle cx="5" cy="6.5" r="1.1" fill="currentColor"/><circle cx="5" cy="12" r="1.1" fill="currentColor"/><circle cx="5" cy="17.5" r="1.1" fill="currentColor"/>',
  settings: gear(),
  sliders: '<path d="M4 7h8.5"/><path d="M16.5 7H20"/><circle cx="14.5" cy="7" r="2"/><path d="M4 17h3.5"/><path d="M11.5 17H20"/><circle cx="9.5" cy="17" r="2"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6.5 6.5 11 11"/><path d="m17.5 6.5-11 11"/>',
  check: '<path d="m5 12.6 4.4 4.4L19 7.4"/>',
  'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  'chevron-up': '<path d="m6 14.5 6-6 6 6"/>',
  'arrow-left': '<path d="M19 12H5.5"/><path d="m11 6-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h13.5"/><path d="m13 6 6 6-6 6"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
  external: '<path d="M13.5 4.5h6v6"/><path d="m19.5 4.5-8.2 8.2"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  edit: '<path d="M4.4 19.6 5.3 15 15.6 4.7a2.1 2.1 0 0 1 3 0l.7.7a2.1 2.1 0 0 1 0 3L9 18.7Z"/><path d="m13.6 6.7 3.7 3.7"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="15.3" cy="9.3" r="1.6"/><path d="m3.8 16.6 4.6-4.6a1.4 1.4 0 0 1 2 0l5.2 5.2"/><path d="m13.4 15 1.6-1.6a1.4 1.4 0 0 1 2 0l3.2 3.2"/>',
  video: '<rect x="3.5" y="5" width="17" height="14" rx="2.2"/><path d="M10.4 9.3v5.4a.5.5 0 0 0 .8.4l4-2.7a.5.5 0 0 0 0-.8l-4-2.7a.5.5 0 0 0-.8.4Z"/>',
  file: '<path d="M13.5 3.5H7.2a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2V8.8Z"/><path d="M13.5 3.5v5.3h5.3"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.4"/><path d="M5 9v8.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  link: '<path d="M10.2 13.8a4 4 0 0 0 5.6 0l2.9-2.9a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-2.9 2.9a4 4 0 0 0 5.6 5.6l1-1"/>',
  text: '<path d="M5 6.5h14"/><path d="M5 11h14"/><path d="M5 15.5h9"/>',
  folder: '<path d="M3.5 7.4a2 2 0 0 1 2-2h3.6a1.6 1.6 0 0 1 1.2.5l1.4 1.5h6.8a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  'folder-open': '<path d="M4.4 18.5 3.5 8.3a1.9 1.9 0 0 1 1.9-2h3.7a1.6 1.6 0 0 1 1.2.5l1.4 1.5h6.2a2 2 0 0 1 2 2v.7"/><path d="M4.4 18.5h13.4a1.8 1.8 0 0 0 1.7-1.3l1.5-5a1.4 1.4 0 0 0-1.4-1.8H8.3a1.8 1.8 0 0 0-1.7 1.3Z"/>',
  reveal: '<path d="M3.5 7.4a2 2 0 0 1 2-2h3.6a1.6 1.6 0 0 1 1.2.5l1.4 1.5h6.8a2 2 0 0 1 2 2v2.3"/><path d="M3.5 7.4v9.8a2 2 0 0 0 2 2h5"/><path d="M14.5 19.5 20 14"/><path d="M15.6 14H20v4.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.2"/><path d="M3.5 10h17"/><path d="M8 3.5v3"/><path d="M16 3.5v3"/>',
  clock: '<circle cx="12" cy="12" r="8.3"/><path d="M12 7.6V12l2.9 1.8"/>',
  history: '<path d="M4.6 12a7.6 7.6 0 1 0 2.3-5.4"/><path d="M4.4 4.6v3.6H8"/><path d="M12 8.2V12l2.6 1.6"/>',
  dice: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/>',
  shuffle: '<path d="M4 7.5h2.8a4 4 0 0 1 3.3 1.8l3.8 5.4a4 4 0 0 0 3.3 1.8H20"/><path d="M4 16.5h2.8a4 4 0 0 0 3.3-1.8l.4-.6"/><path d="M13.5 9.9l.4-.6a4 4 0 0 1 3.3-1.8H20"/><path d="m17.6 5.1 2.4 2.4-2.4 2.4"/><path d="m17.6 14.1 2.4 2.4-2.4 2.4"/>',
  sparkle: '<path d="M12 3.6c.5 4.3 3.1 7 7.4 7.4-4.3.5-6.9 3.1-7.4 7.4-.5-4.3-3.1-6.9-7.4-7.4 4.3-.4 6.9-3.1 7.4-7.4Z"/><path d="M18.5 16.5v3.4"/><path d="M16.8 18.2h3.4"/>',
  star: '<path d="M12 4.2 14.3 9l5.2.6-3.9 3.6 1 5.2L12 15.8l-4.6 2.6 1-5.2-3.9-3.6 5.2-.6Z"/>',
  moon: '<path d="M19.4 14.3A7.9 7.9 0 1 1 9.7 4.6a6.3 6.3 0 0 0 9.7 9.7Z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M6 18l1.3-1.3M16.7 7.3 18 6"/>',
  globe: '<circle cx="12" cy="12" r="8.3"/><path d="M3.8 12h16.4"/><path d="M12 3.7c2.2 2.3 3.3 5 3.3 8.3s-1.1 6-3.3 8.3c-2.2-2.3-3.3-5-3.3-8.3s1.1-6 3.3-8.3Z"/>',
  language: '<path d="M4 6h8"/><path d="M8 4v2"/><path d="M10.3 6c-.6 3.4-2.6 6-5.8 7.6"/><path d="M5.8 9.2c1 1.8 2.6 3.2 4.6 4"/><path d="m12.6 20 3.4-8.4 3.4 8.4"/><path d="M13.7 17.4h4.6"/>',
  database: '<ellipse cx="12" cy="6.4" rx="7" ry="2.7"/><path d="M5 6.4v11.2c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6.4"/><path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7"/>',
  layers: '<path d="m12 4 8 4.2-8 4.2-8-4.2Z"/><path d="m4 12.2 8 4.2 8-4.2"/><path d="m4 16.2 8 4.2 8-4.2"/>',
  hash: '<path d="M9.5 4.5 8 19.5"/><path d="m16 4.5-1.5 15"/><path d="M5 9h14.5"/><path d="M4.5 15H19"/>',
  user: '<circle cx="12" cy="8.6" r="3.6"/><path d="M5 19.6a7 7 0 0 1 14 0"/>',
  'cols-1': '<rect x="4.5" y="4.5" width="15" height="6.4" rx="1.6"/><rect x="4.5" y="13.1" width="15" height="6.4" rx="1.6"/>',
  'cols-2': '<rect x="4.5" y="4.5" width="6.4" height="15" rx="1.6"/><rect x="13.1" y="4.5" width="6.4" height="15" rx="1.6"/>',
  sort: '<path d="M8 5v14"/><path d="m4.5 8.5 3.5-3.5 3.5 3.5"/><path d="M16 19V5"/><path d="m12.5 15.5 3.5 3.5 3.5-3.5"/>',
  filter: '<path d="M4.5 5.5h15l-5.8 7v5.3l-3.4 1.7v-7Z"/>',
  more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  trash: '<path d="M4.5 6.8h15"/><path d="M9.5 6.8V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2v1.6"/><path d="m6.3 6.8.8 11.3a2 2 0 0 0 2 1.9h5.8a2 2 0 0 0 2-1.9l.8-11.3"/>',
  eye: '<path d="M3 12s3.3-6.3 9-6.3S21 12 21 12s-3.3 6.3-9 6.3S3 12 3 12Z"/><circle cx="12" cy="12" r="2.7"/>',
  'eye-off': '<path d="M10.2 5.9a8.6 8.6 0 0 1 1.8-.2c5.7 0 9 6.3 9 6.3a15.4 15.4 0 0 1-2.3 3.1"/><path d="M15.3 15.4a8.7 8.7 0 0 1-3.3 2.9c-5.7 0-9-6.3-9-6.3a15.5 15.5 0 0 1 3.4-4"/><path d="M10.1 10.2a2.7 2.7 0 0 0 3.8 3.8"/><path d="m4.5 4.5 15 15"/>',
  info: '<circle cx="12" cy="12" r="8.3"/><path d="M12 11v5"/><circle cx="12" cy="7.9" r=".9" fill="currentColor"/>',
  alert: '<path d="M10.3 4.9 3.4 17a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.6v4"/><circle cx="12" cy="16.7" r=".9" fill="currentColor"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.3"/><path d="m8.4 12.3 2.5 2.5 4.8-5"/>',
  'x-circle': '<circle cx="12" cy="12" r="8.3"/><path d="m9.3 9.3 5.4 5.4"/><path d="m14.7 9.3-5.4 5.4"/>',
  play: '<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4a.8.8 0 0 0-1.2.7Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4.5 9.6v4.8h3.2L12 18V6L7.7 9.6Z"/><path d="M15.3 9.2a4 4 0 0 1 0 5.6"/><path d="M17.8 6.8a7.4 7.4 0 0 1 0 10.4"/>',
  'volume-off': '<path d="M4.5 9.6v4.8h3.2L12 18V6L7.7 9.6Z"/><path d="m15.5 9.8 4.4 4.4"/><path d="m19.9 9.8-4.4 4.4"/>',
  expand: '<path d="M4.5 9V4.5H9"/><path d="M15 4.5h4.5V9"/><path d="M19.5 15v4.5H15"/><path d="M9 19.5H4.5V15"/>',
  'zoom-in': '<circle cx="11" cy="11" r="6.4"/><path d="m15.8 15.8 4.4 4.4"/><path d="M11 8.3v5.4"/><path d="M8.3 11h5.4"/>',
  'zoom-out': '<circle cx="11" cy="11" r="6.4"/><path d="m15.8 15.8 4.4 4.4"/><path d="M8.3 11h5.4"/>',
  grip: '<circle cx="9" cy="6.5" r="1.1" fill="currentColor"/><circle cx="15" cy="6.5" r="1.1" fill="currentColor"/><circle cx="9" cy="12" r="1.1" fill="currentColor"/><circle cx="15" cy="12" r="1.1" fill="currentColor"/><circle cx="9" cy="17.5" r="1.1" fill="currentColor"/><circle cx="15" cy="17.5" r="1.1" fill="currentColor"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.4a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v7.1a2 2 0 0 0 2 2h2.1"/>',
  home: '<path d="M4.5 10.4 12 4.5l7.5 5.9V18a2 2 0 0 1-2 2h-3.3v-5h-4.4v5H6.5a2 2 0 0 1-2-2Z"/>',
  palette: '<path d="M12 3.8a8.2 8.2 0 1 0 0 16.4c1.2 0 1.8-.8 1.6-1.8-.3-1.4.3-2.4 1.8-2.4h1.6a3.3 3.3 0 0 0 3.2-3.3C20.2 7.6 16.6 3.8 12 3.8Z"/><circle cx="7.8" cy="11.5" r="1.1" fill="currentColor"/><circle cx="10.4" cy="7.7" r="1.1" fill="currentColor"/><circle cx="15" cy="7.9" r="1.1" fill="currentColor"/>',
  key: '<circle cx="8" cy="15.5" r="3.6"/><path d="m10.6 13 8.4-8.4"/><path d="m16.5 7.1 2.4 2.4"/><path d="m14.2 9.4 1.8 1.8"/>',
  undo: '<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.6"/>',
  /* data security: a shield that keeps things safe */
  shield: '<path d="M12 3.7 5.4 6.3v5.2c0 4.1 2.8 7.3 6.6 8.7 3.8-1.4 6.6-4.6 6.6-8.7V6.3Z"/><path d="m9.3 12.1 1.9 1.9 3.6-3.8"/>',
  /* a snapshot: a saved copy, kept behind the current one */
  snapshot: '<path d="M8 4.5h9.5a2 2 0 0 1 2 2V16"/><rect x="4.5" y="7.5" width="12" height="12.5" rx="2"/><path d="m7.9 13.9 2.1 2.1 3.7-3.9"/>',
  changes: '<path d="M13.5 3.5H7.2a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2V8.8Z"/><path d="M13.5 3.5v5.3h5.3"/><path d="M12 10.9v4.4"/><path d="M9.8 13.1h4.4"/><path d="M9.8 17.4h4.4"/>',
  /* server mode: the gallery speaking to the network */
  broadcast: '<circle cx="12" cy="12" r="1.7"/><path d="M8.7 8.7a4.7 4.7 0 0 0 0 6.6"/><path d="M15.3 8.7a4.7 4.7 0 0 1 0 6.6"/><path d="M6.1 6.1a8.4 8.4 0 0 0 0 11.8"/><path d="M17.9 6.1a8.4 8.4 0 0 1 0 11.8"/>',
  wifi: '<path d="M4.6 9.6a10.5 10.5 0 0 1 14.8 0"/><path d="M7.5 12.6a6.4 6.4 0 0 1 9 0"/><path d="M10.3 15.6a2.4 2.4 0 0 1 3.4 0"/><circle cx="12" cy="18.6" r="1" fill="currentColor"/>',
  network: '<rect x="9.2" y="3.8" width="5.6" height="4.6" rx="1.1"/><rect x="3.6" y="15.6" width="5.6" height="4.6" rx="1.1"/><rect x="14.8" y="15.6" width="5.6" height="4.6" rx="1.1"/><path d="M12 8.4V12"/><path d="M6.4 15.6V14a2 2 0 0 1 2-2h7.2a2 2 0 0 1 2 2v1.6"/>',
  phone: '<rect x="7" y="3.5" width="10" height="17" rx="2.3"/><path d="M10.6 17.4h2.8"/>',
  qr: '<rect x="4" y="4" width="6.2" height="6.2" rx="1.2"/><rect x="13.8" y="4" width="6.2" height="6.2" rx="1.2"/><rect x="4" y="13.8" width="6.2" height="6.2" rx="1.2"/><path d="M13.8 13.8h2.4M20 13.8v2.4M13.8 17.2V20h2.4M18.6 18.6H20V20"/>',
  /* MCP: one gallery, several assistants linked to it */
  mcp: '<circle cx="12" cy="12.6" r="2.6"/><circle cx="5.6" cy="6.2" r="1.9"/><circle cx="18.4" cy="6.2" r="1.9"/><circle cx="12" cy="20" r="1.5"/><path d="m7 7.6 3.1 3.1"/><path d="m17 7.6-3.1 3.1"/><path d="M12 15.2v3.3"/>',

  /* ---------------------------------------------------------------- Prism */
  /* a group: a stack of pictures, the way a folder of images actually looks */
  gallery: '<rect x="7.5" y="7.5" width="13" height="12" rx="2"/><path d="M16.5 7.5V6a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><path d="m7.8 17.4 3.5-3.5a1.3 1.3 0 0 1 1.8 0l4.1 4.1"/><circle cx="16.3" cy="11.4" r="1.3"/>',
  'gallery-plus': '<path d="M11 19.5H9.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V12"/><path d="M16.5 7.5V6a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/><path d="M17.5 14.5v6"/><path d="M14.5 17.5h6"/>',
  tag: `<path d="${TAG}"/><circle cx="8.6" cy="8.6" r="1.35"/>`,
  tags: '<path d="M3.6 11.7V5.6a1.4 1.4 0 0 1 1.4-1.4h6.1a1.4 1.4 0 0 1 1 .41l5.8 5.8a1.4 1.4 0 0 1 0 1.98l-6.1 6.1a1.4 1.4 0 0 1-1.98 0l-5.8-5.8a1.4 1.4 0 0 1-.42-1Z"/><circle cx="7.7" cy="8.3" r="1.25"/><path d="m14.2 4.2 6.3 6.3a1.4 1.4 0 0 1 0 1.98l-6.4 6.4"/>',
  /* the wall's layout: rows of pictures at their own widths · a grid of equal squares */
  'ratio-natural': '<rect x="3.5" y="4.5" width="7" height="6.5" rx="1.3"/><rect x="12.5" y="4.5" width="8" height="6.5" rx="1.3"/><rect x="3.5" y="13" width="10.5" height="6.5" rx="1.3"/><rect x="16" y="13" width="4.5" height="6.5" rx="1.3"/>',
  'ratio-square': '<rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4"/>',
  /* colour groups: a fan of paint chips */
  swatches: '<rect x="3.8" y="4.5" width="7.2" height="15" rx="1.6"/><path d="M3.8 14.6h7.2"/><path d="m11 7.2 2.6-1.5a1.4 1.4 0 0 1 1.9.5l3.8 6.6a1.4 1.4 0 0 1-.5 1.9L11 19"/><circle cx="7.4" cy="17.1" r=".9" fill="currentColor"/>',
  /* prompts: text with a + (positive) or − (negative) */
  'prompt-plus': '<path d="M4.5 6.5h11"/><path d="M4.5 11h8"/><path d="M4.5 15.5h5"/><path d="M17.5 12.8v6"/><path d="M14.5 15.8h6"/>',
  'prompt-minus': '<path d="M4.5 6.5h11"/><path d="M4.5 11h8"/><path d="M4.5 15.5h5"/><path d="M14.5 15.8h6"/>',
  /* search by text → pictures; search by a picture */
  'text-image': '<path d="M4 5.5h8"/><path d="M8 5.5v8.5"/><rect x="12.5" y="11" width="8" height="8.5" rx="1.7"/><path d="m12.8 17.4 2.1-2.1a1 1 0 0 1 1.4 0l3.9 3.9"/><circle cx="17.7" cy="13.8" r=".8" fill="currentColor"/>',
  'image-search': '<path d="M11 19.5H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V11"/><path d="m4.3 15.2 3.9-3.9a1.3 1.3 0 0 1 1.8 0l1.4 1.4"/><circle cx="16" cy="16" r="3.2"/><path d="m18.4 18.4 2.1 2.1"/>',
  /* re-indexing: Prism looks at the picture again — the picture, held in a viewfinder's soft corners (not "open"'s
     sharp, empty ones; nothing like the page's refresh). While it runs, the corners focus in and out round the
     picture instead of the whole icon turning (.pr-focus, see the task lists) */
  reindex: '<g class="pr-focus"><path d="M4 7.6V6a2 2 0 0 1 2-2h1.6"/><path d="M16.4 4h1.6a2 2 0 0 1 2 2v1.6"/><path d="M20 16.4v1.6a2 2 0 0 1-2 2h-1.6"/><path d="M7.6 20H6a2 2 0 0 1-2-2v-1.6"/></g><rect x="8.3" y="8.8" width="7.4" height="6.4" rx="1.2"/><path d="m8.6 14.1 2-2a.85.85 0 0 1 1.2 0l2.8 2.8"/>',
  /* a reminder: a small bell, its clapper swung · not to be reminded again: the bell struck through */
  bell: '<path d="M12 4.3v1.4"/><path d="M6.9 16.9v-5.2a5.1 5.1 0 0 1 10.2 0v5.2"/><path d="M5 16.9h14"/><path d="M10.1 19.6a2.1 2.1 0 0 0 3.8 0"/>',
  'bell-off': '<path d="M12 4.3v1.4"/><path d="M8.2 8a5.1 5.1 0 0 0-1.3 3.7v5.2"/><path d="M10 6.9a5.1 5.1 0 0 1 7.1 4.8v3.4"/><path d="M5 16.9h11.9"/><path d="M10.1 19.6a2.1 2.1 0 0 0 3.8 0"/><path d="m4.6 4.6 14.8 14.8"/>',
  /* statistics: three columns on a baseline, each a little taller (they rise one after another on hover: .pr-col) */
  stats: '<path d="M4 19.6h16"/><rect class="pr-col" x="5.5" y="12.4" width="3.2" height="5.4" rx="1.1"/><rect class="pr-col" x="10.4" y="8.6" width="3.2" height="9.2" rx="1.1"/><rect class="pr-col" x="15.3" y="4.8" width="3.2" height="13" rx="1.1"/>',
  /* a model (the tagger): a chip */
  chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1"/><path d="M9.5 3.6v2.9M14.5 3.6v2.9M9.5 17.5v2.9M14.5 17.5v2.9M3.6 9.5h2.9M3.6 14.5h2.9M17.5 9.5h2.9M17.5 14.5h2.9"/>',
  'drag-drop': '<path d="M9 4.5H6.5a2 2 0 0 0-2 2V9"/><path d="M4.5 13v2"/><path d="M9 19.5H6.5a2 2 0 0 1-2-2"/><path d="M13 4.5h2"/><path d="M19.5 9V6.5a2 2 0 0 0-2-2"/><path d="m12 12 7.6 2.6-3.3 1.4-1.4 3.3Z"/>',
  /* the graphics card the models can run on: a fan on a board, its connector underneath */
  gpu: '<path d="M3.5 5v14"/><rect x="3.5" y="7" width="17" height="9.5" rx="1.8"/><circle cx="12.6" cy="11.75" r="2.8"/><path d="M8 16.5v2.5h8.6v-2.5"/>',
  /* the whiteboard: a board with cards laid on it */
  whiteboard: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><rect x="6.8" y="7.8" width="5" height="5" rx="1.1"/><rect x="12.2" y="11.2" width="5" height="5" rx="1.1"/>',
  /* a file name that is already taken: one file in front of another */
  'file-stack': '<path d="M9.5 3.8h5.3l4.2 4.2v8.2a2 2 0 0 1-2 2H9.5a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2Z"/><path d="M14.6 3.8v4.4H19"/><path d="M4.5 7.8v10.4a2 2 0 0 0 2 2h8"/>',
  /* naming: a text field with its caret */
  rename: '<rect x="3" y="7" width="18" height="10" rx="2.2"/><path d="M6.8 12h5"/><path d="M16 9.6v4.8"/><path d="M14.7 9.6h2.6"/><path d="M14.7 14.4h2.6"/>',
  /* places in the folder picker */
  monitor: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M12 16v3.5"/><path d="M8.5 19.5h7"/>',
  drive: '<rect x="3.5" y="6.5" width="17" height="11" rx="2.4"/><path d="M3.8 13.2h16.4"/><circle cx="16.8" cy="15.4" r=".9" fill="currentColor"/>',

  /* ---------------------------------------------------------------- a group's page */
  /* colour groups flowing on: a run that leaves one row at its end and carries on at the start of the next */
  'layout-mixed': '<rect x="3.5" y="4.5" width="6" height="6.5" rx="1.5"/><path d="M20.5 4.5h-6.3a1.5 1.5 0 0 0-1.5 1.5v3.5a1.5 1.5 0 0 0 1.5 1.5h6.3"/><path d="M3.5 13h4.8a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H3.5"/><rect x="12.7" y="13" width="7.8" height="6.5" rx="1.5"/>',
  /* every colour group folded / unfolded */
  'fold-all': '<path d="m7 4.5 5 4.5 5-4.5"/><path d="m7 19.5 5-4.5 5 4.5"/>',
  'unfold-all': '<path d="m7 9 5-4.5L17 9"/><path d="m7 15 5 4.5 5-4.5"/>',
  /* a few per colour group, then more */
  limit: '<rect x="3.5" y="6.5" width="4.8" height="11" rx="1.3"/><rect x="10.2" y="6.5" width="4.8" height="11" rx="1.3"/><circle cx="18.1" cy="12" r="1" fill="currentColor"/><circle cx="21" cy="12" r="1" fill="currentColor"/>',
  /* tile sizes: many small ones · one large picture */
  'size-small': '<rect x="4" y="4" width="4.3" height="4.3" rx="1"/><rect x="9.85" y="4" width="4.3" height="4.3" rx="1"/><rect x="15.7" y="4" width="4.3" height="4.3" rx="1"/><rect x="4" y="9.85" width="4.3" height="4.3" rx="1"/><rect x="9.85" y="9.85" width="4.3" height="4.3" rx="1"/><rect x="15.7" y="9.85" width="4.3" height="4.3" rx="1"/><rect x="4" y="15.7" width="4.3" height="4.3" rx="1"/><rect x="9.85" y="15.7" width="4.3" height="4.3" rx="1"/><rect x="15.7" y="15.7" width="4.3" height="4.3" rx="1"/>',
  'size-large': '<rect x="3.5" y="3.5" width="17" height="17" rx="2.6"/><path d="m3.9 16.8 4.6-4.6a1.4 1.4 0 0 1 2 0l6.3 6.3"/><circle cx="15.6" cy="8.6" r="1.6"/>',
  'sort-desc': '<path d="M4 6.5h9"/><path d="M4 11.5h6.5"/><path d="M4 16.5h4"/><path d="M17.5 5v13.5"/><path d="m14.5 15.5 3 3 3-3"/>',
  'sort-asc': '<path d="M4 6.5h4"/><path d="M4 11.5h6.5"/><path d="M4 16.5h9"/><path d="M17.5 19V5.5"/><path d="m14.5 8.5 3-3 3 3"/>',
  /* the group's cover: a picture with a small star on it */
  cover: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="m3.8 16.6 4.4-4.4a1.4 1.4 0 0 1 2 0l5.4 5.4"/><path d="M15.6 7.2c.2 1.3.95 2.05 2.25 2.25-1.3.2-2.05.95-2.25 2.25-.2-1.3-.95-2.05-2.25-2.25 1.3-.2 2.05-.95 2.25-2.25Z"/>',
  /* joining the covers / leaving them: the cover picture, its corner opened for a plus or a minus */
  'cover-add': '<path d="M20.5 12.6V6.7a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v10.6a2.2 2.2 0 0 0 2.2 2.2h6.6"/><path d="m3.8 16.6 4.4-4.4a1.4 1.4 0 0 1 2 0l2.9 2.9"/><path d="M15.6 7.2c.2 1.3.95 2.05 2.25 2.25-1.3.2-2.05.95-2.25 2.25-.2-1.3-.95-2.05-2.25-2.25 1.3-.2 2.05-.95 2.25-2.25Z"/><path d="M18 14.6v5.8"/><path d="M15.1 17.5h5.8"/>',
  'cover-remove': '<path d="M20.5 12.6V6.7a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v10.6a2.2 2.2 0 0 0 2.2 2.2h6.6"/><path d="m3.8 16.6 4.4-4.4a1.4 1.4 0 0 1 2 0l2.9 2.9"/><path d="M15.6 7.2c.2 1.3.95 2.05 2.25 2.25-1.3.2-2.05.95-2.25 2.25-.2-1.3-.95-2.05-2.25-2.25 1.3-.2 2.05-.95 2.25-2.25Z"/><path d="M15.1 17.5h5.8"/>',
  /* a slideshow: a picture with play on it, the next one waiting behind */
  slideshow: '<rect x="3.5" y="6" width="13.5" height="12" rx="2"/><path d="M20.5 8.2v7.6"/><path d="M8.8 9.6v4.8a.55.55 0 0 0 .85.46l3.7-2.4a.55.55 0 0 0 0-.92l-3.7-2.4a.55.55 0 0 0-.85.46Z"/>',
  /* carried on from the row above */
  wrap: '<path d="M6.5 5v6.6a3 3 0 0 0 3 3h9"/><path d="m15.2 11.2 3.4 3.4-3.4 3.4"/>',
  /* back to fitting the screen */
  fit: '<path d="M9 4.5V9H4.5"/><path d="M15 4.5V9h4.5"/><path d="M15 19.5V15h4.5"/><path d="M9 19.5V15H4.5"/>',
  'check-square': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/>',
  /* the colour groups as a list beside the files: a bullet and a line for each (the toolbar draws its bullets in the
     colour groups' own colours) */
  list: '<circle cx="5.2" cy="6.5" r="1.9" fill="currentColor" stroke="none"/><path d="M9.6 6.5h9.5"/><circle cx="5.2" cy="12" r="1.9" fill="currentColor" stroke="none"/><path d="M9.6 12h9.5"/><circle cx="5.2" cy="17.5" r="1.9" fill="currentColor" stroke="none"/><path d="M9.6 17.5h6.5"/>',
  /* to the very top / bottom of a list */
  'to-top': '<path d="M6 4.8h12"/><path d="M12 19.2V9.2"/><path d="m7.6 13.4 4.4-4.4 4.4 4.4"/>',
  'to-bottom': '<path d="M6 19.2h12"/><path d="M12 4.8v10"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/>',
};

export function Icon({ name, size, stroke = 1.6, className, style, label }) {
  const s = size ?? '1em';
  return (
    <svg
      viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: I[name] ?? '' }}
    />
  );
}

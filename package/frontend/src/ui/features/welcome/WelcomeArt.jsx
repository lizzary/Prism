// The night window on the left of the first-run dialog: a slice of sky in the painting's palette, a line drawing
// for each step (drawn in when the step opens), and the setup's progress as a small constellation.
import s from './Welcome.module.css';

const CREAM = '#f6f0de';
const STAR = '#f1d35a';
const MOON = '#ecc05a';
const NIGHT = '#1a2a5c';
/** The three rays of the Prism mark. */
const RAYS = ['#e9c460', '#dc8f84', '#86a5da'];

const f1 = (n) => n.toFixed(1);
/** Catmull-Rom → cubic Bézier, so every curve is smooth rather than a chain of segments. */
function smooth(pts) {
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
/** A spiral arm like the sky of the home painting, starting a little way out from the eye. */
function swirl(cx, cy, r0, r1, turns, phase = 0, squash = 0.84) {
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, a = phase + t * turns * Math.PI * 2, r = r0 + (r1 - r0) * t;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a) * squash]);
  }
  return smooth(pts);
}
const SKY = [
  { d: swirl(262, 96, 10, 74, 1.9), w: 2.4, c: '#8fb6d2', o: 0.32 },
  { d: swirl(262, 96, 16, 60, 1.6, 2.4), w: 1.2, c: '#e9efe0', o: 0.3 },
  { d: swirl(262, 96, 26, 84, 1.2, 4.2), w: 1, c: '#8fb6d2', o: 0.18 },
  { d: swirl(48, 470, 8, 52, 1.7, 1), w: 2, c: '#8fb6d2', o: 0.18 },
  { d: swirl(48, 470, 14, 40, 1.4, 3.4), w: 1, c: '#e9efe0', o: 0.16 },
];
const WIND = smooth([[-10, 214], [70, 200], [150, 222], [230, 206], [350, 226]]);
const DOTS = [[34, 54, 1.3], [120, 30, 1], [300, 188, 1.2], [70, 150, 0.9], [184, 64, 1.1], [296, 330, 1], [24, 330, 1.1], [214, 400, 0.9], [140, 452, 1], [310, 470, 0.9]];

export function WelcomeArt({ step, total }) {
  return (
    <div className={s.art} aria-hidden="true">
      <svg className={s.sky} viewBox="0 0 340 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="prw-moonlight" cx="0.77" cy="0.16" r="0.42">
            <stop offset="0" stopColor="#f4d77a" stopOpacity="0.24" />
            <stop offset="1" stopColor="#f4d77a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="prw-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.62" stopColor="#0e1838" stopOpacity="0" />
            <stop offset="1" stopColor="#0e1838" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <rect width="340" height="600" fill="url(#prw-moonlight)" />
        <g className={s.swirls}>
          {SKY.slice(0, 3).map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.c} strokeWidth={p.w} strokeLinecap="round" opacity={p.o} />)}
        </g>
        <g className={s.swirlsSmall}>
          {SKY.slice(3).map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.c} strokeWidth={p.w} strokeLinecap="round" opacity={p.o} />)}
        </g>
        <path d={WIND} fill="none" stroke="#c9dccf" strokeWidth="1" strokeLinecap="round" opacity=".12" />
        {DOTS.map(([x, y, r], i) => <circle key={i} className={s.twinkle} style={{ '--d': `${(i * 0.53) % 3}s` }} cx={x} cy={y} r={r} fill={CREAM} />)}
        <rect width="340" height="600" fill="url(#prw-floor)" />
      </svg>
      <div className={s.scene} key={step}>
        <svg viewBox="0 0 300 300" className={s.drawing}>
          <defs>
            <radialGradient id="prw-glow"><stop offset="0" stopColor={STAR} stopOpacity=".34" /><stop offset="1" stopColor={STAR} stopOpacity="0" /></radialGradient>
            <radialGradient id="prw-halo"><stop offset="0" stopColor={CREAM} stopOpacity=".1" /><stop offset="1" stopColor={CREAM} stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx="150" cy="150" r="130" fill="url(#prw-halo)" />
          {SCENES[step]?.()}
        </svg>
      </div>
      <Constellation step={step} total={total} />
    </div>
  );
}

const line = { fill: 'none', stroke: CREAM, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1 };
const fine = { ...line, strokeWidth: 1.1, opacity: 0.55 };
const Draw = ({ d, delay = 0, weight = line, fill, ...rest }) => (
  <path d={d} {...weight} fill={fill ?? 'none'} className={s.draw} style={{ '--delay': `${delay}ms` }} {...rest} />
);
/** A dashed line (a link not granted): it fades in, since drawing it in would erase its dashes. */
const Dash = ({ d, delay = 0, dash = '2 6' }) => (
  <path d={d} fill="none" stroke={CREAM} strokeWidth="1.1" strokeLinecap="round" strokeDasharray={dash} opacity=".55" className={s.fade} style={{ '--delay': `${delay}ms` }} />
);
const Glow = ({ x, y, r, delay = 0 }) => <circle cx={x} cy={y} r={r} fill="url(#prw-glow)" className={s.fade} style={{ '--delay': `${delay}ms` }} />;
const Star = ({ x, y, r = 6, delay = 0, color = STAR }) => (
  <path className={s.pop} style={{ '--delay': `${delay}ms`, transformOrigin: `${x}px ${y}px` }} fill={color}
    d={`M${x} ${y - r}c${r * 0.1} ${r * 0.62} ${r * 0.28} ${r * 0.84} ${r} ${r}c${-r * 0.72} ${r * 0.16} ${-r * 0.9} ${r * 0.38} ${-r} ${r}c${-r * 0.1} ${-r * 0.62} ${-r * 0.28} ${-r * 0.84} ${-r} ${-r}c${r * 0.72} ${-r * 0.16} ${r * 0.9} ${-r * 0.38} ${r} ${-r}Z`} />
);
const Moon = ({ x, y, r = 16, delay = 0 }) => (
  <path className={s.pop} style={{ '--delay': `${delay}ms`, transformOrigin: `${x}px ${y}px` }} fill={MOON}
    d={`M${x} ${y - r}a${r} ${r} 0 1 0 ${r * 0.82} ${r * 1.6} ${r * 0.8} ${r * 0.8} 0 1 1 ${-r * 0.82} ${-r * 1.6}Z`} />
);
const Dot = ({ x, y, r = 1.6, delay = 0, color = CREAM }) => <circle cx={x} cy={y} r={r} fill={color} className={s.fade} style={{ '--delay': `${delay}ms` }} />;
/** A coloured ray, drawn out from where it leaves the prism. */
const Ray = ({ d, color, delay, width = 2.6 }) => (
  <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength="1" className={s.draw} style={{ '--delay': `${delay}ms` }} />
);

const SCENES = [
  // welcome: the prism catches a thread of starlight and lets it out as three soft rays
  () => (
    <>
      <Glow x={150} y={150} r={86} delay={200} />
      <path d="M18 190 116 151" fill="none" stroke={STAR} strokeWidth="1.6" strokeLinecap="round" opacity=".9" pathLength="1" className={s.draw} />
      <path d="M18 190 116 151" fill="none" stroke="#fff6d2" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.1 14" className={s.travel} />
      <Draw d="M148 82 210 206H86Z" fill={NIGHT} delay={150} />
      <Draw d="M148 82 165 206" weight={fine} delay={450} />
      <path d="M118 150 171 136" fill="none" stroke={CREAM} strokeWidth="1" strokeLinecap="round" opacity=".38" pathLength="1" className={s.draw} style={{ '--delay': '650ms' }} />
      <Ray d="M172 131C206 118 238 104 280 90" color={RAYS[0]} delay={850} />
      <Ray d="M175 139C210 139 244 140 284 142" color={RAYS[1]} delay={960} />
      <Ray d="M178 147C210 160 242 174 278 190" color={RAYS[2]} delay={1070} />
      <Star x={280} y={90} r={6} delay={1500} color={RAYS[0]} />
      <Dot x={284} y={142} r={3} delay={1580} color={RAYS[1]} />
      <Dot x={278} y={190} r={3} delay={1660} color={RAYS[2]} />
      <Moon x={78} y={78} r={14} delay={600} />
      <Star x={226} y={58} r={4.5} delay={1200} />
      <Dot x={54} y={124} r={1.2} delay={1100} /><Dot x={248} y={238} delay={1250} /><Dot x={112} y={248} r={1.2} delay={1300} />
    </>
  ),
  // password: an arched door, its keyhole lit from within
  () => (
    <>
      <Moon x={228} y={66} r={15} delay={700} />
      <Glow x={150} y={178} r={44} delay={900} />
      <Draw d="M94 246V142a56 56 0 0 1 112 0v104" fill="rgba(246,240,222,.04)" />
      <Draw d="M108 246V146a42 42 0 0 1 84 0v100" delay={150} />
      <Draw d="M122 154a28 28 0 0 1 56 0v4h-56Z" weight={fine} delay={350} />
      <Draw d="M122 208h56v28h-56Z" weight={fine} delay={420} />
      <circle cx="150" cy="176" r="6.5" fill={STAR} className={s.pop} style={{ '--delay': '950ms', transformOrigin: '150px 182px' }} />
      <path d="M146.6 180h6.8l-1.6 13h-3.6Z" fill={STAR} className={s.pop} style={{ '--delay': '950ms', transformOrigin: '150px 182px' }} />
      <Draw d="M76 246h148" delay={250} />
      <Draw d="M90 254h120" weight={fine} delay={350} />
      <Star x={72} y={92} r={4.5} delay={1150} />
      <Dot x={250} y={110} r={1.2} delay={1200} />
    </>
  ),
  // server mode: the computer and a phone, light carried between them by a row of stars
  () => (
    <>
      <Moon x={70} y={70} r={13} delay={700} />
      <Draw d="M56 150h96a6 6 0 0 1 6 6v58H50v-58a6 6 0 0 1 6-6Z" fill="rgba(246,240,222,.04)" />
      <Draw d="M64 170h40M64 182h64M64 194h28" weight={fine} delay={400} />
      <Draw d="M36 222h136l-7 9H43Z" delay={150} />
      <Draw d="M206 138h40a10 10 0 0 1 10 10v82a10 10 0 0 1-10 10h-40a10 10 0 0 1-10-10v-82a10 10 0 0 1 10-10Z" fill="rgba(246,240,222,.04)" delay={250} />
      <Draw d="M219 148h14M220 230h12" weight={fine} delay={450} />
      <path d="M110 140C128 76 200 70 228 128" fill="none" stroke={STAR} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 12" className={s.travel} />
      <Star x={168} y={86} r={6} delay={900} />
      <Dot x={250} y={84} delay={1100} /><Dot x={120} y={104} r={1.2} delay={1150} />
    </>
  ),
  // MCP: the gallery at the centre; assistants reach it only along the links their keys allow
  () => (
    <>
      <Glow x={150} y={152} r={70} delay={200} />
      <Draw d="M150 120a32 32 0 1 1 0 64a32 32 0 1 1 0-64Z" fill={NIGHT} />
      <Draw d="M146 136 160 164H132Z" delay={450} />
      <Ray d="M153 149 169 143" color={RAYS[0]} delay={800} width={1.8} />
      <Ray d="M154 152 171 152" color={RAYS[1]} delay={860} width={1.8} />
      <Ray d="M155 155 169 161" color={RAYS[2]} delay={920} width={1.8} />
      <Draw d="M124 132 90 104" delay={500} />
      <Draw d="M178 134l34-28" delay={600} />
      <Dash d="M150 184v38" dash="2 5" delay={700} />
      <path d="M124 132 90 104M178 134l34-28" fill="none" stroke={STAR} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0.1 10" className={s.travel} />
      <Draw d="M82 82a16 16 0 1 1 0 32a16 16 0 1 1 0-32Z" fill="rgba(246,240,222,.05)" delay={800} />
      <Draw d="M220 84a16 16 0 1 1 0 32a16 16 0 1 1 0-32Z" fill="rgba(246,240,222,.05)" delay={900} />
      <Draw d="M150 222a16 16 0 1 1 0 32a16 16 0 1 1 0-32Z" weight={fine} delay={1000} />
      <Star x={82} y={98} r={6} delay={1150} />
      <Star x={220} y={100} r={6} delay={1250} />
      <Star x={150} y={238} r={5} delay={1350} color="rgba(246,240,222,.35)" />
    </>
  ),
  // done: three choices settled into orbit around a tick
  () => (
    <>
      <Glow x={150} y={150} r={64} delay={300} />
      <Draw d="M150 86a64 64 0 1 1 0 128a64 64 0 1 1 0-128Z" weight={{ ...fine, opacity: 0.35 }} />
      <Draw d="M150 112a38 38 0 1 1 0 76a38 38 0 1 1 0-76Z" fill="rgba(246,240,222,.05)" delay={200} />
      <path d="M133 151l12 12 23-25" fill="none" stroke={STAR} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className={s.draw} style={{ '--delay': '700ms' }} />
      {[[150, 86], [205, 182], [95, 182]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill={RAYS[i]} opacity=".18" className={s.pop} style={{ '--delay': `${1000 + i * 140}ms`, transformOrigin: `${x}px ${y}px` }} />
          <circle cx={x} cy={y} r="4" fill={RAYS[i]} className={s.pop} style={{ '--delay': `${1000 + i * 140}ms`, transformOrigin: `${x}px ${y}px` }} />
        </g>
      ))}
      <Moon x={238} y={62} r={14} delay={500} />
      <Star x={66} y={84} r={4.5} delay={1500} />
    </>
  ),
];

/** Progress as Cassiopeia: one star per step, joined as you go. */
const W = [[14, 22], [66, 50], [116, 24], [166, 54], [218, 16]];
function Constellation({ step, total }) {
  const pts = W.slice(0, total);
  return (
    <svg className={s.constellation} viewBox="0 0 232 70">
      {pts.slice(1).map(([x, y], i) => (
        <line key={i} x1={pts[i][0]} y1={pts[i][1]} x2={x} y2={y} className={s.cLine} data-on={i < step} />
      ))}
      {pts.map(([x, y], i) => (
        <g key={i} className={s.cStar} data-state={i < step ? 'past' : i === step ? 'now' : 'future'} style={{ transformOrigin: `${x}px ${y}px` }}>
          {i === step && <circle cx={x} cy={y} r="11" className={s.cHalo} />}
          <circle cx={x} cy={y} r={i === step ? 4.2 : i < step ? 3.2 : 2.2} />
        </g>
      ))}
    </svg>
  );
}

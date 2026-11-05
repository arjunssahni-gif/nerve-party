import { clamp01, easeOut, hash } from './projection';

export const BURST_MS = 2000;

/**
 * Action-potential burst at a node: white flash, floor shockwave, crackling
 * lightning bolts and sparks. `t` = ms since the fire.
 */
export function Burst({ x, y, s, t, seed, reduced }: { x: number; y: number; s: number; t: number; seed: number; reduced: boolean }) {
  if (t < 0 || t > BURST_MS) return null;
  if (reduced) {
    return <circle cx={x} cy={y} r={90 * s} fill="url(#burst-flash)" opacity={1 - t / 600} />;
  }
  const frame = Math.floor(t / 55); // bolts re-jag every frame for a crackle
  const flashR = (80 + 520 * easeOut(t / 420)) * s;
  const flashO = clamp01(1 - t / 650);
  const waveK = clamp01(t / 1000);
  const boltO = t < 550 ? 1 : clamp01(1 - (t - 550) / 500);

  const bolts = [];
  if (t < 1050) {
    const count = 14;
    for (let i = 0; i < count; i++) {
      if (hash(seed, i, frame, 7) < 0.25) continue; // flicker
      const a = (i / count) * Math.PI * 2 + (hash(seed, i, frame) - 0.5) * 0.5 - Math.PI / 2;
      const len = (170 + 260 * hash(seed, i, frame, 2)) * s * (0.55 + 0.45 * easeOut(t / 180));
      const pts = [{ x, y }];
      const segs = 6;
      for (let k = 1; k <= segs; k++) {
        const d = (len * k) / segs;
        const off = (hash(seed, i, k, frame, 3) - 0.5) * 46 * s * (k < segs ? 1 : 0.3);
        pts.push({ x: x + Math.cos(a) * d - Math.sin(a) * off, y: y + Math.sin(a) * d * 0.75 + Math.cos(a) * off });
      }
      const dstr = 'M ' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
      bolts.push(
        <g key={i} opacity={boltO}>
          <path d={dstr} stroke="#ffd447" strokeWidth={18 * s} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={0.6} filter="url(#burst-blur)" />
          <path d={dstr} stroke="#ffe680" strokeWidth={8 * s} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <path d={dstr} stroke="#ffffff" strokeWidth={3.5 * s} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </g>,
      );
    }
  }

  const sparks = [];
  for (let i = 0; i < 48; i++) {
    const life = 900 + 900 * hash(seed, i, 11);
    if (t > life) continue;
    const k = t / 1000;
    const ang = hash(seed, i, 12) * Math.PI * 2;
    const speed = (320 + 560 * hash(seed, i, 13)) * s;
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed * 0.6 - 380 * s * hash(seed, i, 14);
    const px = x + vx * k;
    const py = y + vy * k + 0.5 * 900 * s * k * k;
    const fade = 1 - t / life;
    const color = i % 3 === 0 ? '#5ce1ff' : i % 3 === 1 ? '#ffd447' : '#ffffff';
    sparks.push(<line key={i} x1={px} y1={py} x2={px - vx * 0.03} y2={py - (vy + 900 * s * k) * 0.03} stroke={color} strokeWidth={6 * s * fade + 0.8} strokeLinecap="round" opacity={fade} />);
  }

  return (
    <g>
      {/* floor shockwave */}
      <ellipse cx={x} cy={y + 30 * s} rx={(40 + 520 * easeOut(waveK)) * s} ry={(14 + 170 * easeOut(waveK)) * s} fill="none" stroke="#ffd447" strokeWidth={10 * s * (1 - waveK) + 0.5} opacity={1 - waveK} filter="url(#burst-blur)" />
      <ellipse cx={x} cy={y + 30 * s} rx={(40 + 520 * easeOut(waveK)) * s} ry={(14 + 170 * easeOut(waveK)) * s} fill="none" stroke="#fff8d6" strokeWidth={3 * s * (1 - waveK) + 0.3} opacity={1 - waveK} />
      {/* flash */}
      <circle cx={x} cy={y} r={flashR} fill="url(#burst-flash)" opacity={flashO} />
      {bolts}
      {sparks}
      {/* comic starburst + ZAP! */}
      <Zap x={x} y={y - 120 * s} s={s} t={t} />
      {/* hot core */}
      <circle cx={x} cy={y} r={(30 + 20 * Math.sin(t / 30)) * s} fill="#fffbe8" opacity={clamp01(1 - t / 500)} filter="url(#burst-blur)" />
    </g>
  );
}

export function BurstDefs() {
  return (
    <>
      <radialGradient id="burst-flash">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
        <stop offset="25%" stopColor="#fff3b0" stopOpacity="0.9" />
        <stop offset="60%" stopColor="#ffb547" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
      </radialGradient>
      <filter id="burst-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
    </>
  );
}

function Zap({ x, y, s, t }: { x: number; y: number; s: number; t: number }) {
  if (t > 1600) return null;
  const pop = t < 160 ? easeOut(t / 160) * 1.25 : t < 300 ? 1.25 - 0.25 * ((t - 160) / 140) : 1;
  const out = t > 1250 ? clamp01(1 - (t - 1250) / 350) : 1;
  const k = pop * s * out;
  const wob = Math.sin(t / 40) * 3;
  const spikes = 14;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 118 : 74 + (i % 4 === 1 ? 10 : 0);
    pts.push(`${(Math.cos(a) * r * 1.25).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${-8 + wob}) scale(${k})`} opacity={out}>
      <polygon points={pts.join(' ')} fill="#ffd447" stroke="#0a1426" strokeWidth={7} strokeLinejoin="round" />
      <polygon points={pts.join(' ')} fill="#fff3b0" transform="scale(0.72)" />
      <text textAnchor="middle" dy="0.35em" fontSize={68} fontWeight={700} fontFamily="Fredoka, sans-serif" fill="#ff5a3d" stroke="#0a1426" strokeWidth={7} paintOrder="stroke" letterSpacing="2">
        ZAP!
      </text>
    </g>
  );
}

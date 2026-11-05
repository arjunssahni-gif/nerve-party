import { useRef, type ReactNode } from 'react';
import type { PlayerView } from '@nerve/engine';
import { Burst, BurstDefs, BURST_MS } from './Burst';
import { Dial } from './Dial';
import { Mascot } from './Mascot';
import { RING_R, TUBE_H, TUBE_W, VIEW, clamp01, easeInOut, hash, poly, project, ringPoint, wrap180 } from './projection';

interface StageProps {
  players: PlayerView[];
  holderId: string | null;
  /** Whose seat is at the front of the ring (you; in pass-the-device, whoever's turn it is). */
  viewerId: string | null;
  potential: number;
  now: number;
  fire: { playerId: string; at: number } | null;
  idle: boolean;
  reduced: boolean;
  /** Keep the mascot frazzled (e.g. during the pause after a fire). */
  zapped?: boolean;
}

const SEGMENTS = 120;
const TRAVEL_MS = 650;
const CAMERA_MS = 950;

/** Animated angle that always moves forward (clockwise) to each new target. */
function useForwardAngle(target: number | null, durMs: number, now: number, reduced: boolean) {
  const st = useRef({ from: target ?? 0, to: target ?? 0, t0: 0, last: target });
  const s = st.current;
  const valueAt = (t: number) => (reduced ? s.to : s.from + (s.to - s.from) * easeInOut((t - s.t0) / durMs));
  if (target !== null && target !== s.last) {
    const cur = valueAt(Date.now());
    let to = target;
    while (to < cur - 0.01) to += 360;
    while (to - cur >= 360) to -= 360;
    st.current = { from: cur, to, t0: Date.now(), last: target };
  }
  const c = st.current;
  const v = reduced ? c.to : c.from + (c.to - c.from) * easeInOut((now - c.t0) / durMs);
  return { value: v, moving: !reduced && now - c.t0 < durMs && Math.abs(c.to - c.from) > 0.5 };
}

export function Stage({ players, holderId, viewerId, potential, now, fire, idle, reduced, zapped = false }: StageProps) {
  const n = Math.max(1, players.length);
  const seat = (id: string | null) => {
    const i = players.findIndex((p) => p.id === id);
    return i < 0 ? null : (360 / n) * i;
  };

  const impulse = useForwardAngle(seat(holderId), TRAVEL_MS, now, reduced);
  const camera = useForwardAngle(seat(viewerId) ?? 0, CAMERA_MS, now, reduced);
  const cam = camera.value;
  const psiOf = (worldDeg: number) => wrap180(worldDeg - cam);

  const fireT = fire ? now - fire.at : Infinity;
  const firing = fire && fireT >= 0 && fireT < BURST_MS ? fire : null;
  const firedSeat = firing ? seat(firing.playerId) : null;
  const hot = clamp01((potential - 0.75) / 0.25);

  // Screen shake right after a fire.
  let shakeX = 0;
  let shakeY = 0;
  if (firing && !reduced && fireT < 500) {
    const k = 1 - fireT / 500;
    const f = Math.floor(fireT / 30);
    shakeX = (hash(f, 1) - 0.5) * 22 * k;
    shakeY = (hash(f, 2) - 0.5) * 14 * k;
  }

  // ── Tube segments ──
  const glowCenter = holderId && !idle ? psiOf(impulse.value) : null;
  const sigma = impulse.moving ? 13 : 22;
  type Seg = { psi: number; a: number; b: number; depth: number; key: number };
  const segs: Seg[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = -180 + (360 / SEGMENTS) * i;
    const b = a + 360 / SEGMENTS + 0.4; // tiny overlap hides seams
    const psi = a + 180 / SEGMENTS;
    segs.push({ psi, a, b, depth: Math.cos((psi * Math.PI) / 180), key: i });
  }
  const back = segs.filter((s) => s.depth < 0).sort((x, y) => x.depth - y.depth);
  const front = segs.filter((s) => s.depth >= 0).sort((x, y) => x.depth - y.depth);

  const glowAt = (psi: number, i: number) => {
    if (glowCenter === null) return 0;
    const d = wrap180(psi - glowCenter);
    const base = Math.exp(-((d / sigma) ** 2));
    if (base < 0.02) return 0;
    // Uneven, living glow: slow waves + per-segment crackle.
    const wave = 0.78 + 0.22 * Math.sin(now / 160 + i * 0.9) * (reduced ? 0 : 1);
    const crackle = reduced ? 1 : 0.85 + 0.3 * hash(i, Math.floor(now / 70));
    return base * wave * crackle * (0.85 + hot * 0.4);
  };
  const fireGlowAt = (psi: number) => {
    if (!firing || firedSeat === null) return 0;
    const d = wrap180(psi - psiOf(firedSeat));
    return Math.exp(-((d / 30) ** 2)) * clamp01(1 - fireT / 1100);
  };

  const arc = (r: number, from: number, to: number, y: number) => {
    const pts = [];
    const steps = 60;
    for (let k = 0; k <= steps; k++) pts.push(ringPoint(r, from + ((to - from) * k) / steps, y));
    return pts;
  };
  const pathOf = (pts: { x: number; y: number }[]) => 'M ' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  const tube = (half: 'back' | 'front') => {
    const [from, to] = half === 'front' ? [-90, 90] : [90, 270];
    const outerTop = arc(RING_R + TUBE_W, from, to, TUBE_H);
    const innerTop = arc(RING_R - TUBE_W, from, to, TUBE_H);
    const core = arc(RING_R, from, to, TUBE_H * 0.55);
    if (half === 'back') {
      const innerBottom = arc(RING_R - TUBE_W, from, to, 0);
      return (
        <g>
          <polygon points={poly([...innerTop, ...innerBottom.reverse()])} fill="url(#wall-in)" />
          <path d={pathOf(core)} stroke="#6fdcff" strokeOpacity={0.28} strokeWidth={7} fill="none" />
          <polygon points={poly([...outerTop, ...innerTop.slice().reverse()])} fill="rgba(140,215,255,0.13)" stroke="rgba(190,235,255,0.25)" strokeWidth={1.5} />
          <path d={pathOf(arc(RING_R - TUBE_W * 0.7, from, to, TUBE_H))} stroke="#fff" strokeOpacity={0.14} strokeWidth={2} fill="none" />
        </g>
      );
    }
    const outerBottom = arc(RING_R + TUBE_W, from, to, 0);
    return (
      <g>
        <path d={pathOf(core)} stroke="#6fdcff" strokeOpacity={0.4} strokeWidth={11} fill="none" strokeLinecap="round" />
        <polygon points={poly([...outerTop, ...innerTop.slice().reverse()])} fill="rgba(140,215,255,0.2)" stroke="rgba(190,235,255,0.3)" strokeWidth={1.5} />
        <polygon points={poly([...outerTop, ...outerBottom.slice().reverse()])} fill="url(#wall-out)" />
        <path d={pathOf(arc(RING_R + TUBE_W * 0.72, from, to, TUBE_H))} stroke="#fff" strokeOpacity={0.4} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <path d={pathOf(arc(RING_R + TUBE_W, from, to, TUBE_H * 0.15))} stroke="#bff4ff" strokeOpacity={0.18} strokeWidth={2} fill="none" />
      </g>
    );
  };

  const glow = (list: Seg[], strength: (psi: number, i: number) => number, color: string, core: string, id: string) => {
    const halo: ReactNode[] = [];
    const body: ReactNode[] = [];
    const cores: ReactNode[] = [];
    for (const s of list) {
      const g = strength(s.psi, s.key);
      if (g <= 0.02) continue;
      const wide = [ringPoint(RING_R - TUBE_W * 2.2, s.a, TUBE_H * 0.6), ringPoint(RING_R - TUBE_W * 2.2, s.b, TUBE_H * 0.6), ringPoint(RING_R + TUBE_W * 2.2, s.b, TUBE_H * 0.6), ringPoint(RING_R + TUBE_W * 2.2, s.a, TUBE_H * 0.6)];
      halo.push(<polygon key={s.key} points={poly(wide)} fill={color} opacity={Math.min(1, g * 0.85)} />);
      const tight = [ringPoint(RING_R - TUBE_W, s.a, TUBE_H), ringPoint(RING_R - TUBE_W, s.b, TUBE_H), ringPoint(RING_R + TUBE_W, s.b, TUBE_H), ringPoint(RING_R + TUBE_W, s.a, TUBE_H)];
      body.push(<polygon key={s.key} points={poly(tight)} fill={color} opacity={Math.min(1, g * 0.95)} />);
      const c0 = ringPoint(RING_R, s.a, TUBE_H * 0.55);
      const c1 = ringPoint(RING_R, s.b, TUBE_H * 0.55);
      cores.push(<line key={s.key} x1={c0.x} y1={c0.y} x2={c1.x} y2={c1.y} stroke={core} strokeOpacity={Math.min(1, g * 1.1)} strokeWidth={10 * c0.s} strokeLinecap="round" />);
    }
    if (!halo.length) return null;
    return (
      <g key={id} style={{ mixBlendMode: 'screen' }}>
        <g filter="url(#glow-wide)">{halo}</g>
        <g filter="url(#glow-soft)">{body}</g>
        <g filter="url(#glow-core)">{cores}</g>
      </g>
    );
  };

  const glowColor = hot > 0 ? mixHex('#3fd2ff', '#e9fbff', hot * 0.6) : '#3fd2ff';

  // ── Nodes ──
  const nodes = players.map((p, i) => {
    const psi = psiOf((360 / n) * i);
    const depth = Math.cos((psi * Math.PI) / 180);
    return { p, i, psi, depth };
  });
  const renderNode = ({ p, psi, depth }: (typeof nodes)[number]) => {
    const top = ringPoint(RING_R, psi, TUBE_H + 26);
    const r = 44 * top.s * (n > 6 ? 0.8 : n > 5 ? 0.9 : 1);
    const isHolder = p.id === holderId && !idle && !impulse.moving;
    const isFired = firing?.playerId === p.id;
    const out = !p.alive;
    const fade = 0.5 + 0.5 * ((depth + 1) / 2);
    const labelBelow = depth > 0.35;
    const labelY = labelBelow ? ringPoint(RING_R + TUBE_W, psi, 0).y + 26 * top.s : top.y - r - 26 * top.s;
    const pills = Math.max(p.maxLives, p.lives);
    const pw = 16 * top.s;
    const pg = 5 * top.s;
    const pillsW = pills * pw + (pills - 1) * pg;
    return (
      <g key={p.id} opacity={out ? 0.45 : fade} aria-label={`${p.name}, ${p.lives} lives${isHolder ? ', has the signal' : ''}`}>
        {/* soma shadow on the tube */}
        <ellipse cx={top.x} cy={ringPoint(RING_R, psi, TUBE_H).y + 4 * top.s} rx={r * 1.05} ry={r * 0.32} fill="#000" opacity={0.35} />
        <circle
          cx={top.x}
          cy={top.y}
          r={r}
          fill={isFired ? '#3a2a10' : isHolder ? 'url(#soma-active)' : out ? '#141c2c' : 'url(#soma)'}
          stroke={isFired ? '#ffd447' : isHolder ? '#bff4ff' : '#0a1426'}
          strokeWidth={(isHolder ? 5 : 4.5) * top.s}
          strokeDasharray={out ? `${8 * top.s} ${6 * top.s}` : undefined}
        />
        <ellipse cx={top.x - r * 0.35} cy={top.y - r * 0.42} rx={r * 0.3} ry={r * 0.17} fill="#fff" opacity={isHolder ? 0.6 : 0.22} transform={`rotate(-25 ${top.x - r * 0.35} ${top.y - r * 0.42})`} />
        <text x={top.x} y={top.y} dy="0.36em" textAnchor="middle" fontSize={26 * top.s} fontWeight={700} fontFamily="Fredoka, sans-serif" fill={out ? '#5a6880' : isHolder ? '#04121a' : '#dfe8f6'}>
          {out ? '✕' : initials(p.name)}
        </text>
        <text x={top.x} y={labelY} textAnchor="middle" fontSize={22 * top.s} fontWeight={600} fontFamily="Fredoka, sans-serif" fill={isHolder ? '#7fe8ff' : '#dfe8f6'} stroke="#05070d" strokeWidth={5 * top.s} paintOrder="stroke">
          {truncate(p.name, 12)}
        </text>
        <g transform={`translate(${top.x - pillsW / 2} ${labelY + 9 * top.s})`}>
          {Array.from({ length: pills }, (_, k) => (
            <rect key={k} x={k * (pw + pg)} y={0} width={pw} height={7 * top.s} rx={3.5 * top.s} fill={k < p.lives ? '#5ce1ff' : '#0a1426'} stroke={k < p.lives ? '#0a1426' : '#2a3a55'} strokeWidth={1.5 * top.s} />
          ))}
        </g>
      </g>
    );
  };
  const backNodes = nodes.filter((x) => x.depth < 0).sort((a, b) => a.depth - b.depth);
  const frontNodes = nodes.filter((x) => x.depth >= 0).sort((a, b) => a.depth - b.depth);

  // Traveling impulse blob
  let blob: ReactNode = null;
  if (impulse.moving && glowCenter !== null) {
    const bp = ringPoint(RING_R, glowCenter, TUBE_H * 0.6);
    blob = (
      <g style={{ mixBlendMode: 'screen' }}>
        <circle cx={bp.x} cy={bp.y} r={46 * bp.s} fill="url(#blob)" />
        <circle cx={bp.x} cy={bp.y} r={9 * bp.s} fill="#f4feff" />
      </g>
    );
  }

  const center = project(0, 0, 0);
  const mascotAt = project(0, -110, 0);
  const burstPos = firing && firedSeat !== null ? ringPoint(RING_R, psiOf(firedSeat), TUBE_H + 26) : null;
  const flashOverlay = firing && !reduced ? clamp01(0.35 - fireT / 600) : 0;

  return (
    <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="mx-auto block h-auto max-h-[62vh] w-full select-none" role="img" aria-label="The axon ring">
      <defs>
        <radialGradient id="stage-bg" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#13213d" />
          <stop offset="55%" stopColor="#0a1122" />
          <stop offset="100%" stopColor="#04060c" />
        </radialGradient>
        <radialGradient id="spot-floor" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#bfe9ff" stopOpacity="0.22" />
          <stop offset="60%" stopColor="#6fb8e8" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#6fb8e8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="spot-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9f3ff" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#d9f3ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wall-out" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fd3ff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#1d5f99" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id="wall-in" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f8fd0" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#163e6e" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id="soma" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#3b5a86" />
          <stop offset="100%" stopColor="#16233c" />
        </radialGradient>
        <radialGradient id="soma-active" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#e9fbff" />
          <stop offset="55%" stopColor="#7fe3ff" />
          <stop offset="100%" stopColor="#2aa9d6" />
        </radialGradient>
        <radialGradient id="blob">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="30%" stopColor="#a8f0ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#5ce1ff" stopOpacity="0" />
        </radialGradient>
        <filter id="glow-wide" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="4" result="noise">
            {!reduced && <animate attributeName="baseFrequency" values="0.018;0.028;0.018" dur="2.6s" repeatCount="indefinite" />}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="38" />
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="glow-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="glow-core" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <BurstDefs />
      </defs>


      <g transform={`translate(${shakeX} ${shakeY})`}>
        {/* soft spotlight */}
        <polygon points={`430,${VIEW.y - 20} 570,${VIEW.y - 20} ${center.x + 520},${center.y + 40} ${center.x - 520},${center.y + 40}`} fill="url(#spot-cone)" />
        <ellipse cx={center.x} cy={center.y + 20} rx={560} ry={210} fill="url(#spot-floor)" />
        {/* ring shadow on the floor */}
        <ellipse cx={center.x} cy={center.y + 18} rx={RING_R * 0.98} ry={RING_R * 0.36} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={50} filter="url(#glow-soft)" />

        {/* back half */}
        {tube('back')}
        {glow(back, glowAt, glowColor, '#c9f6ff', 'gb')}
        {glow(back, fireGlowAt, '#ffd447', '#fffbe8', 'fb')}
        {backNodes.map(renderNode)}

        {/* mascot in the middle */}
        <g transform={`translate(${mascotAt.x} ${mascotAt.y}) scale(${mascotAt.s * 1.3})`}>
          <Mascot potential={idle ? 0 : potential} zapped={zapped || !!firing} now={now} reduced={reduced} />
        </g>

        {/* front half */}
        {tube('front')}
        {glow(front, glowAt, glowColor, '#c9f6ff', 'gf')}
        {glow(front, fireGlowAt, '#ffd447', '#fffbe8', 'ff')}
        {blob}
        {frontNodes.map(renderNode)}

        {burstPos && firing && <Burst x={burstPos.x} y={burstPos.y} s={burstPos.s} t={fireT} seed={firing.at % 997} reduced={reduced} />}
      </g>

      {/* voltage dial */}
      <g transform={`translate(${VIEW.x + 92} ${VIEW.y + 92})`}>
        <Dial potential={potential} now={now} reduced={reduced} idle={idle} />
      </g>

      {flashOverlay > 0 && <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="#fff8e0" opacity={flashOverlay} />}
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return s.toUpperCase();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + ((((pb >> sh) & 255) - ((pa >> sh) & 255)) * clamp01(t)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

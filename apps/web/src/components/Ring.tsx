import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@nerve/engine';

const R = 140; // axon ring radius
const NODE_R = 19;
const GAUGE_R = 74;

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number) => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });
const seatAngle = (i: number, n: number) => -90 + (360 / n) * i;

function arcPath(r: number, from: number, to: number): string {
  const a = polar(r, from);
  const b = polar(r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} ${sweep} ${b.x} ${b.y}`;
}

/** Animates the impulse angle clockwise to each new holder. */
function useTravel(target: number | null, reduced: boolean) {
  const [angle, setAngle] = useState(target ?? -90);
  const [from, setFrom] = useState<number | null>(null);
  const cur = useRef(target ?? -90);
  useEffect(() => {
    if (target === null) return;
    let start = cur.current;
    let end = target;
    while (end < start - 0.01) end += 360;
    if (end - start < 0.01 || reduced) {
      cur.current = end % 360;
      setAngle(cur.current);
      setFrom(null);
      return;
    }
    const dist = end - start;
    const dur = Math.min(650, 260 + dist * 1.4);
    const t0 = performance.now();
    let raf = 0;
    setFrom(start);
    const step = (t: number) => {
      const x = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - x, 3);
      const a = start + dist * e;
      cur.current = a;
      setAngle(a);
      if (x < 1) raf = requestAnimationFrame(step);
      else {
        cur.current = end % 360;
        setFrom(null);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      start = cur.current;
    };
  }, [target, reduced]);
  return { angle, from };
}

interface RingProps {
  players: PlayerView[];
  holderId: string | null;
  /** 0..1 toward threshold. */
  potential: number;
  mv: number;
  firing: { playerId: string; name: string } | null;
  reduced: boolean;
  idle?: boolean;
}

export function Ring({ players, holderId, potential, mv, firing, reduced, idle }: RingProps) {
  const n = Math.max(players.length, 1);
  const holderIdx = players.findIndex((p) => p.id === holderId);
  const target = holderIdx >= 0 ? seatAngle(holderIdx, n) : null;
  const { angle, from } = useTravel(target, reduced);
  const traveling = from !== null;
  const hot = potential > 0.8;
  const pulse = polar(R, angle);
  const trailFrom = from !== null ? Math.max(from, angle - 70) : angle;
  const flicker = hot && !reduced ? 0.75 + 0.25 * Math.sin(Date.now() / 45) : 1;
  const halo = 16 + potential * 16;

  return (
    <svg viewBox="-215 -215 430 430" className="w-full max-w-[280px] select-none sm:max-w-[400px] lg:max-w-[460px]" role="img" aria-label="Axon ring">
      <defs>
        <radialGradient id="np-glow">
          <stop offset="0%" stopColor="#e9fbff" stopOpacity="1" />
          <stop offset="35%" stopColor="#5ce1ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#5ce1ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="np-fire">
          <stop offset="0%" stopColor="#fff3df" stopOpacity="1" />
          <stop offset="40%" stopColor="#ffb547" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <filter id="np-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Axon */}
      <circle r={R} fill="none" stroke="#1e2a40" strokeWidth={3} />
      <circle r={R} fill="none" stroke="#5ce1ff" strokeOpacity={0.06} strokeWidth={10} />

      {/* Trail while the impulse travels */}
      {traveling && angle - trailFrom > 1 && (
        <>
          <path d={arcPath(R, trailFrom, angle)} stroke="#5ce1ff" strokeWidth={8} strokeOpacity={0.35} fill="none" filter="url(#np-blur)" strokeLinecap="round" />
          <path d={arcPath(R, trailFrom, angle)} stroke="#a8f0ff" strokeWidth={2.5} fill="none" strokeLinecap="round" />
        </>
      )}

      {/* Voltage gauge (center) */}
      <Gauge potential={potential} mv={mv} hot={hot} firing={firing} reduced={reduced} idle={idle} />

      {/* Player nodes */}
      {players.map((p, i) => {
        const a = seatAngle(i, n);
        const pos = polar(R, a);
        const label = polar(R + 46, a);
        const isHolder = p.id === holderId && !traveling && !idle;
        const isFiring = firing?.playerId === p.id;
        const out = !p.alive;
        return (
          <g key={p.id} transform={`translate(${pos.x} ${pos.y})`} aria-label={`${p.name}${isHolder ? ', has the signal' : ''}, ${p.lives} lives`}>
            {isHolder && <circle r={NODE_R + halo * flicker} fill="url(#np-glow)" opacity={0.55 + potential * 0.35} />}
            {isFiring && <circle r={NODE_R + 30} fill="url(#np-fire)" opacity={0.9} />}
            <circle
              r={NODE_R}
              fill={isHolder ? '#0d2233' : '#0e1626'}
              stroke={isFiring ? '#ffb547' : isHolder ? '#5ce1ff' : out ? '#2a3a55' : '#3a4c6b'}
              strokeWidth={isHolder || isFiring ? 3 : 2}
              strokeDasharray={out ? '4 4' : undefined}
            />
            <text textAnchor="middle" dy="0.36em" fontSize={13} fontWeight={700} fill={out ? '#5a6880' : isHolder ? '#e9fbff' : '#c5d1e4'}>
              {out ? '✕' : initials(p.name)}
            </text>
            <g transform={`translate(${label.x - pos.x} ${label.y - pos.y})`}>
              <text textAnchor="middle" dy="-0.2em" fontSize={13} fontWeight={isHolder ? 700 : 500} fill={isHolder ? '#5ce1ff' : out ? '#5a6880' : '#c5d1e4'}>
                {truncate(p.name, 12)}
              </text>
              <Myelin lives={p.lives} max={p.maxLives} out={out} />
            </g>
          </g>
        );
      })}

      {/* Traveling impulse */}
      {traveling && (
        <g transform={`translate(${pulse.x} ${pulse.y})`}>
          <circle r={18} fill="url(#np-glow)" />
          <circle r={4.5} fill="#f2fdff" />
        </g>
      )}
    </svg>
  );
}

/** Lives drawn as myelin segments. */
function Myelin({ lives, max, out }: { lives: number; max: number; out: boolean }) {
  const w = 10;
  const gap = 3;
  const total = Math.max(max, lives);
  const width = total * w + (total - 1) * gap;
  return (
    <g transform={`translate(${-width / 2} 6)`}>
      {Array.from({ length: total }, (_, i) => (
        <rect key={i} x={i * (w + gap)} y={0} width={w} height={5} rx={2.5} fill={i < lives ? '#5ce1ff' : 'none'} stroke={i < lives ? 'none' : out ? '#2a3a55' : '#3a4c6b'} opacity={out ? 0.4 : 1} />
      ))}
    </g>
  );
}

const AP_PATH = 'M -70 30 L -38 30 L -30 22 L -22 30 L -16 30 L -8 -34 L 2 26 L 10 40 L 26 34 L 70 30';

function Gauge({ potential, mv, hot, firing, reduced, idle }: { potential: number; mv: number; hot: boolean; firing: RingProps['firing']; reduced: boolean; idle?: boolean }) {
  const start = 135;
  const sweep = 270;
  const end = start + sweep * Math.min(1, Math.max(0.001, potential));
  const color = hot ? '#ffb547' : '#5ce1ff';

  if (firing) {
    return (
      <g aria-live="assertive">
        <path
          d={AP_PATH}
          fill="none"
          stroke="#ffb547"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={reduced ? undefined : { strokeDasharray: 400, strokeDashoffset: 400, animation: 'np-draw 0.7s ease-out forwards' }}
        />
        <style>{'@keyframes np-draw { to { stroke-dashoffset: 0; } }'}</style>
        <text textAnchor="middle" y={-52} fontSize={11} letterSpacing="0.18em" fill="#ffd59a" fontWeight={700}>
          ACTION POTENTIAL
        </text>
        <text textAnchor="middle" y={72} fontSize={15} fill="#ffb547" fontWeight={700}>
          {truncate(firing.name, 14)} fired
        </text>
      </g>
    );
  }

  return (
    <g>
      <path d={arcPath(GAUGE_R, start, start + sweep)} stroke="#1a2438" strokeWidth={8} fill="none" strokeLinecap="round" />
      {!idle && potential > 0.002 && (
        <path d={arcPath(GAUGE_R, start, end)} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      )}
      <text textAnchor="middle" y={4} fontSize={32} fontWeight={700} fill={idle ? '#5a6880' : hot ? '#ffd59a' : '#e7eef9'} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {idle ? '−70.0' : mv.toFixed(1).replace('-', '−')}
      </text>
      <text textAnchor="middle" y={24} fontSize={11} fill="#8d9bb3" letterSpacing="0.12em">
        mV
      </text>
      <text textAnchor="middle" y={GAUGE_R + 2} fontSize={9.5} fill="#5a6880" letterSpacing="0.08em">
        THRESHOLD −55
      </text>
    </g>
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

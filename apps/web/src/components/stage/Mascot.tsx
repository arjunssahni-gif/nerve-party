import { clamp01, lerp } from './projection';

export type MascotMood = 'chill' | 'uneasy' | 'surprised' | 'shocked' | 'critical' | 'zapped';

export function moodFor(potential: number, zapped: boolean): MascotMood {
  if (zapped) return 'zapped';
  if (potential < 0.4) return 'chill';
  if (potential < 0.62) return 'uneasy';
  if (potential < 0.8) return 'surprised';
  if (potential < 0.92) return 'shocked';
  return 'critical';
}

const OUTLINE = '#0a1426';

/**
 * "Inter" — a little interneuron in sunglasses. Origin is between his feet.
 * Heat (0..1) makes him glow white-hot as the membrane nears threshold.
 */
export function Mascot({ potential, zapped, now, reduced }: { potential: number; zapped: boolean; now: number; reduced: boolean }) {
  const mood = moodFor(potential, zapped);
  const heat = zapped ? 0 : clamp01((potential - 0.72) / 0.26);
  const t = now / 1000;
  const bob = reduced ? 0 : mood === 'chill' ? Math.sin(t * 2.2) * 3 : 0;
  const shake = reduced ? 0 : mood === 'critical' ? Math.sin(t * 70) * 2.5 : mood === 'shocked' ? Math.sin(t * 40) * 1 : 0;
  const squash = mood === 'zapped' ? 0.94 : 1;

  // Body colour: cool cyan → white-hot.
  const c1 = mix('#bff4ff', '#ffffff', heat);
  const c2 = mix('#3fb9e0', '#fff6dc', heat);
  const zappedBody = mood === 'zapped';

  return (
    <g transform={`translate(${shake} ${bob}) scale(1 ${squash})`}>
      <defs>
        <radialGradient id="inter-body" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={zappedBody ? '#8a97ad' : c1} />
          <stop offset="100%" stopColor={zappedBody ? '#3a4660' : c2} />
        </radialGradient>
        <radialGradient id="inter-heat">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#fff3c4" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#5ce1ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx={0} cy={2} rx={52} ry={10} fill="#000" opacity={0.45} />

      {/* Heat halo */}
      {heat > 0 && <circle cx={0} cy={-82} r={70 + heat * 70 + (reduced ? 0 : Math.sin(t * 25) * 6 * heat)} fill="url(#inter-heat)" opacity={0.35 + heat * 0.65} />}

      {/* Axon tail */}
      <path d="M 30 -30 C 70 -20, 80 0, 104 -6" stroke={OUTLINE} strokeWidth={13} fill="none" strokeLinecap="round" />
      <path d="M 30 -30 C 70 -20, 80 0, 104 -6" stroke="url(#inter-body)" strokeWidth={7} fill="none" strokeLinecap="round" />

      {/* Feet */}
      <ellipse cx={-20} cy={-6} rx={15} ry={9} fill="url(#inter-body)" stroke={OUTLINE} strokeWidth={4.5} />
      <ellipse cx={20} cy={-6} rx={15} ry={9} fill="url(#inter-body)" stroke={OUTLINE} strokeWidth={4.5} />

      {/* Dendrites (hair/arms) */}
      <Dendrites mood={mood} t={t} reduced={reduced} />

      {/* Soma */}
      <path
        d="M 0 -150 C 42 -150, 62 -118, 60 -84 C 58 -46, 34 -22, 0 -22 C -34 -22, -58 -46, -60 -84 C -62 -118, -42 -150, 0 -150 Z"
        fill="url(#inter-body)"
        stroke={OUTLINE}
        strokeWidth={5}
      />
      {/* Shine */}
      <ellipse cx={-24} cy={-122} rx={13} ry={8} fill="#fff" opacity={0.55} transform="rotate(-25 -24 -122)" />
      {/* Nucleus hint */}
      {!zappedBody && <circle cx={18} cy={-48} r={7} fill="#0a1426" opacity={0.12} />}

      <Face mood={mood} heat={heat} t={t} reduced={reduced} />

      {mood === 'uneasy' && <Sweat x={52} y={-104} t={t} />}
      {mood === 'surprised' && <Sweat x={54} y={-110} t={t} />}
      {mood === 'zapped' && <Smoke t={t} />}
    </g>
  );
}

function Dendrites({ mood, t, reduced }: { mood: MascotMood; t: number; reduced: boolean }) {
  const stiff = mood === 'shocked' || mood === 'critical';
  const spiky = mood === 'zapped';
  const wave = reduced ? 0 : Math.sin(t * 3) * (stiff ? 1 : 4);
  const branches = [
    { x: -30, y: -140, dx: -34, dy: -38 },
    { x: 0, y: -150, dx: 0, dy: -46 },
    { x: 30, y: -140, dx: 34, dy: -38 },
    { x: -56, y: -96, dx: -42, dy: -8 },
    { x: 56, y: -96, dx: 42, dy: -8 },
  ];
  return (
    <g>
      {branches.map((b, i) => {
        const ex = b.x + b.dx * (stiff ? 1.15 : 1) + (i % 2 ? wave : -wave);
        const ey = b.y + b.dy * (stiff ? 1.2 : 1);
        const mx = b.x + b.dx * 0.5 + (spiky ? (i % 2 ? 10 : -10) : wave * 0.5) + (stiff ? 0 : b.dy * 0.15);
        const my = b.y + b.dy * 0.5 + (spiky ? 8 : 0);
        const d = spiky ? `M ${b.x} ${b.y} L ${mx} ${my} L ${ex} ${ey}` : `M ${b.x} ${b.y} Q ${mx} ${my} ${ex} ${ey}`;
        return (
          <g key={i}>
            <path d={d} stroke={OUTLINE} strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} stroke="url(#inter-body)" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={ex} cy={ey} r={6.5} fill="url(#inter-body)" stroke={OUTLINE} strokeWidth={3.5} />
          </g>
        );
      })}
    </g>
  );
}

function Shades({ y = 0, rot = 0, x = 0, cracked = false }: { y?: number; rot?: number; x?: number; cracked?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M -40 -2 L 40 -2" stroke={OUTLINE} strokeWidth={4} />
      <rect x={-38} y={-12} width={32} height={22} rx={8} fill="#0b1220" stroke={OUTLINE} strokeWidth={3} />
      <rect x={6} y={-12} width={32} height={22} rx={8} fill="#0b1220" stroke={OUTLINE} strokeWidth={3} />
      <path d="M -32 -6 L -22 -6" stroke="#5ce1ff" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
      <path d="M 12 -6 L 22 -6" stroke="#5ce1ff" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
      {cracked && <path d="M 14 -10 L 22 0 L 18 4 L 30 9" stroke="#8d9bb3" strokeWidth={1.5} fill="none" />}
    </g>
  );
}

function Eyes({ size, pupil, squeeze }: { size: number; pupil: number; squeeze?: boolean }) {
  if (squeeze) {
    return (
      <g stroke={OUTLINE} strokeWidth={4.5} strokeLinecap="round" fill="none">
        <path d="M -30 -94 L -16 -88 L -30 -82" />
        <path d="M 30 -94 L 16 -88 L 30 -82" />
      </g>
    );
  }
  return (
    <g>
      {[-20, 20].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={-88} rx={size} ry={size * 1.12} fill="#fff" stroke={OUTLINE} strokeWidth={3.5} />
          <circle cx={x} cy={-87} r={pupil} fill={OUTLINE} />
          <circle cx={x - pupil * 0.35} cy={-89 - pupil * 0.35} r={Math.max(1.2, pupil * 0.35)} fill="#fff" />
        </g>
      ))}
    </g>
  );
}

function Face({ mood, t, reduced }: { mood: MascotMood; heat: number; t: number; reduced: boolean }) {
  switch (mood) {
    case 'chill':
      return (
        <g>
          <Shades y={-88} />
          <path d="M -16 -56 Q 2 -44 20 -58" stroke={OUTLINE} strokeWidth={4.5} fill="none" strokeLinecap="round" />
          <circle cx={-38} cy={-62} r={7} fill="#ff9fb6" opacity={0.45} />
          <circle cx={38} cy={-62} r={7} fill="#ff9fb6" opacity={0.45} />
        </g>
      );
    case 'uneasy':
      return (
        <g>
          <Shades y={-88} />
          <path d="M 8 -110 Q 22 -118 36 -112" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M -16 -56 Q -6 -60 2 -56 Q 10 -52 18 -56" stroke={OUTLINE} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'surprised':
      return (
        <g>
          <Eyes size={11} pupil={4.5} />
          <Shades y={-66} />
          <path d="M -34 -112 Q -20 -122 -8 -114" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M 8 -114 Q 20 -122 34 -112" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <ellipse cx={2} cy={-44} rx={6} ry={7} fill={OUTLINE} />
        </g>
      );
    case 'shocked': {
      return (
        <g>
          <Eyes size={15} pupil={3.2} />
          <path d="M -36 -118 Q -20 -130 -6 -120" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M 6 -120 Q 20 -130 36 -118" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <ellipse cx={2} cy={-48} rx={12} ry={14} fill={OUTLINE} />
          <ellipse cx={2} cy={-43} rx={7} ry={6} fill="#ff7a8e" />
          {/* Shades whipped off, held up in a dendrite */}
          <Shades x={80} y={-158} rot={-28} />
        </g>
      );
    }
    case 'critical':
      return (
        <g>
          <Eyes size={15} pupil={2} squeeze={Math.sin(t * 12) > 0.2 && !reduced} />
          <rect x={-14} y={-62} width={32} height={22} rx={10} fill={OUTLINE} />
          <path d="M -10 -56 L 14 -56" stroke="#fff" strokeWidth={3} />
          <Shades x={84} y={-176} rot={-40} />
        </g>
      );
    case 'zapped':
      return (
        <g>
          <g stroke={OUTLINE} strokeWidth={4.5} strokeLinecap="round">
            <path d="M -28 -96 L -12 -80 M -12 -96 L -28 -80" />
            <path d="M 12 -96 L 28 -80 M 28 -96 L 12 -80" />
          </g>
          <path d="M -14 -50 Q -4 -58 4 -50 Q 12 -42 20 -50" stroke={OUTLINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Shades x={-70} y={-4} rot={168} cracked />
        </g>
      );
  }
}

function Sweat({ x, y, t }: { x: number; y: number; t: number }) {
  const drop = (t * 40) % 30;
  return <path d={`M ${x} ${y + drop} q 6 10 0 14 q -6 -4 0 -14 z`} fill="#9be8ff" stroke={OUTLINE} strokeWidth={2} opacity={1 - drop / 34} />;
}

function Smoke({ t }: { t: number }) {
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const k = ((t * 0.8 + i / 3) % 1 + 1) % 1;
        return <circle key={i} cx={lerp(-10, 20, i / 2) + Math.sin(t * 3 + i) * 6} cy={-160 - k * 70} r={10 + k * 14} fill="#5a6880" opacity={0.5 * (1 - k)} />;
      })}
    </g>
  );
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, clamp01(t)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

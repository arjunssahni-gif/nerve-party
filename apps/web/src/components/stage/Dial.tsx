/** Chunky cartoon voltage dial: a needle sweeping from −70 (rest) to −55 (threshold). */
export function Dial({ potential, now, reduced, idle }: { potential: number; now: number; reduced: boolean; idle?: boolean }) {
  const p = idle ? 0 : potential;
  const start = -125;
  const sweep = 250;
  const wobble = reduced || p < 0.85 ? 0 : Math.sin(now / 30) * 3 * p;
  const angle = start + sweep * p + wobble;
  const mv = -70 + 15 * p;
  const R = 54;
  const zone = (from: number, to: number, color: string) => {
    const a0 = ((start + sweep * from - 90) * Math.PI) / 180;
    const a1 = ((start + sweep * to - 90) * Math.PI) / 180;
    const r = R - 9;
    return (
      <path
        d={`M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${to - from > 0.72 ? 1 : 0} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`}
        stroke={color}
        strokeWidth={9}
        fill="none"
      />
    );
  };
  const ticks = Array.from({ length: 16 }, (_, i) => {
    const a = ((start + (sweep * i) / 15 - 90) * Math.PI) / 180;
    const long = i % 5 === 0;
    return <line key={i} x1={(R - 20) * Math.cos(a)} y1={(R - 20) * Math.sin(a)} x2={(R - (long ? 30 : 25)) * Math.cos(a)} y2={(R - (long ? 30 : 25)) * Math.sin(a)} stroke="#c5d1e4" strokeWidth={long ? 3 : 1.5} strokeLinecap="round" />;
  });
  const hot = p > 0.85;
  return (
    <g aria-label={`Membrane potential ${mv.toFixed(0)} millivolts`}>
      {/* bezel */}
      <circle r={R + 8} fill="#0a1426" />
      <circle r={R + 4} fill="#1b2a44" stroke="#0a1426" strokeWidth={4} />
      <circle r={R - 2} fill="#0b1322" />
      {zone(0, 0.6, '#1f6f8f')}
      {zone(0.6, 0.85, '#d6a531')}
      {zone(0.85, 1, '#ff7a45')}
      {ticks}
      <text y={R - 6} textAnchor="middle" fontSize={11} fontWeight={800} fill="#8d9bb3" fontFamily="Fredoka, sans-serif">
        mV
      </text>
      <text x={-R + 14} y={26} textAnchor="middle" fontSize={10} fill="#8d9bb3" fontFamily="Fredoka, sans-serif">
        −70
      </text>
      <text x={R - 14} y={26} textAnchor="middle" fontSize={10} fill={hot ? '#ffb547' : '#8d9bb3'} fontFamily="Fredoka, sans-serif">
        −55
      </text>
      {/* needle */}
      <g transform={`rotate(${angle})`}>
        <path d={`M -5 6 L 0 ${-(R - 12)} L 5 6 Z`} fill={hot ? '#ffb547' : '#5ce1ff'} stroke="#0a1426" strokeWidth={2.5} strokeLinejoin="round" />
      </g>
      <circle r={9} fill="#e7eef9" stroke="#0a1426" strokeWidth={3} />
      {/* readout plate */}
      <rect x={-34} y={R + 14} width={68} height={24} rx={8} fill="#0a1426" stroke="#1e2a40" strokeWidth={2} />
      <text y={R + 31} textAnchor="middle" fontSize={15} fontWeight={700} fill={hot ? '#ffd59a' : '#e7eef9'} fontFamily="Fredoka, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {mv.toFixed(1).replace('-', '−')}
      </text>
    </g>
  );
}

/** Two concentric rings: outer = seen, inner = mastered. */
export function ProgressRing({ seen, mastered, size = 56, label }: { seen: number; mastered: number; size?: number; label?: string }) {
  const r1 = size / 2 - 4;
  const r2 = r1 - 7;
  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(mastered * 100)}% mastered, ${Math.round(seen * 100)}% seen`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r1} fill="none" stroke="#1e2a40" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r1} fill="none" stroke="#3a6a8a" strokeWidth={4} strokeLinecap="round" strokeDasharray={`${c1 * seen} ${c1}`} />
        <circle cx={size / 2} cy={size / 2} r={r2} fill="none" stroke="#1e2a40" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r2} fill="none" stroke="#5ce1ff" strokeWidth={4} strokeLinecap="round" strokeDasharray={`${c2 * mastered} ${c2}`} style={{ filter: 'drop-shadow(0 0 3px #5ce1ff)' }} />
      </g>
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size / 4.6} fontWeight={700} fill="#e7eef9">
        {Math.round(mastered * 100)}%
      </text>
    </svg>
  );
}

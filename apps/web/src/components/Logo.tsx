export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="11" fill="none" stroke="#2a3a55" strokeWidth="2" />
      <circle cx="16" cy="5" r="3.4" fill="#5ce1ff" style={{ filter: 'drop-shadow(0 0 4px #5ce1ff)' }} />
      <path d="M9 18 h3 l2 -6 l3 10 l2 -4 h4" fill="none" stroke="#5ce1ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

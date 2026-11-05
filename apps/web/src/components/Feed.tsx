import type { FeedEntry, PlayerView } from '@nerve/engine';

export function Feed({ feed, players }: { feed: FeedEntry[]; players: PlayerView[] }) {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const items = [...feed].reverse().slice(0, 14);
  return (
    <section className="panel p-4" aria-label="Live answer feed">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-mute">Live feed</h3>
      {items.length === 0 ? (
        <p className="text-sm text-dim">Answers show up here.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((f) => (
            <li key={f.seq} className="flex gap-2">
              <span className="w-4 shrink-0 text-center" aria-hidden>
                {f.result === 'accepted' ? <span className="text-pulse">✓</span> : f.result === 'fired' ? <span className="text-fire">⚡</span> : f.result === 'bonus' ? <span className="text-pulse">+</span> : <span className="text-fire/80">✕</span>}
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-ink/90">{name(f.playerId)}</span>{' '}
                <span className={f.result === 'rejected' ? 'text-mute line-through decoration-fire/50' : f.result === 'fired' ? 'text-fire-2' : 'text-ink/80'}>{f.text}</span>
                {f.note && f.result !== 'rejected' && <span className="ml-1 text-xs text-mute">{f.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

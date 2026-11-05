import { useEffect, useRef } from 'react';
import type { PlayerView, Reveal as RevealData } from '@nerve/engine';

const TITLES: Record<RevealData['reason'], string> = {
  complete: 'Round complete — every answer named',
  max_fires: 'Round over — here’s the full list',
  carry_exhausted: 'Nobody got it',
  wrong_choice: 'One try — here’s the answer',
  answered: 'Answered',
};

interface Props {
  reveal: RevealData;
  players: PlayerView[];
  msLeft: number;
  totalMs: number;
  onContinue: () => void;
}

export function Reveal({ reveal, players, msLeft, totalMs, onContinue }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), []);
  const name = (id?: string) => players.find((p) => p.id === id)?.name;
  const missed = reveal.answers.filter((a) => !a.gotBy);
  const isList = reveal.type === 'list';

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-bg/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="reveal-title">
      <div className="panel w-full max-w-2xl p-6 shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-mute">Reveal</div>
        <h2 id="reveal-title" className="mt-1 text-lg font-semibold">
          {TITLES[reveal.reason]}
        </h2>
        <p className="mt-3 text-mute">{reveal.prompt}</p>

        {isList ? (
          <>
            {missed.length > 0 && (
              <p className="mt-4 text-sm text-fire-2">
                {missed.length} answer{missed.length > 1 ? 's' : ''} nobody named — highlighted below.
              </p>
            )}
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {reveal.answers.map((a) => (
                <li
                  key={a.text}
                  className={
                    a.gotBy
                      ? 'flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm'
                      : 'flex items-center justify-between gap-2 rounded-lg border border-fire/60 bg-fire/10 px-3 py-2 text-sm font-semibold text-fire-2'
                  }
                >
                  <span>
                    {a.gotBy ? '✓ ' : '◆ '}
                    {a.text}
                    {a.supplemented && <span className="ml-1.5 text-xs font-normal text-dim">(textbook)</span>}
                  </span>
                  <span className="text-xs font-normal text-mute">{a.gotBy ? name(a.gotBy) : 'missed'}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-lg font-semibold text-pulse-2">
            {reveal.answers.map((a) => a.text).join(reveal.format === 'ordered' ? ' → ' : ', ')}
          </div>
        )}

        {reveal.explanation && <p className="mt-3 text-sm text-mute">{reveal.explanation}</p>}
        <p className="mt-3 text-xs text-dim">
          {reveal.sourceDeck}
          {reveal.sourceRef.slide ? ` · slide ${reveal.sourceRef.slide}` : reveal.sourceRef.page ? ` · p. ${reveal.sourceRef.page}` : ''}
          {reveal.sourceRef.snippet ? ` · “${reveal.sourceRef.snippet}”` : ''}
        </p>

        <div className="mt-5 flex items-center gap-4">
          <button ref={btn} className="btn btn-primary" onClick={onContinue}>
            Continue
          </button>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full bg-mute/60" style={{ width: `${(msLeft / Math.max(1, totalMs)) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-mute">{Math.ceil(msLeft / 1000)}s</span>
        </div>
      </div>
    </div>
  );
}

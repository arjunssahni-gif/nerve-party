import { useMemo, useState } from 'react';
import { buildSummary, groupStudyItems, summaryToCsv, summaryToMarkdown, type GameState } from '@nerve/engine';
import { ProgressRing } from '../components/ProgressRing';
import { getDeckProgress } from '../lib/progress';
import { downloadText } from '../lib/storage';
import type { GameSetup } from './Setup';

interface Props {
  state: GameState;
  setup: GameSetup;
  onAgain: () => void;
  onSettings: () => void;
  onHome: () => void;
}

const REASON: Record<string, string> = { fired: 'ran out of time', wrong_choice: 'wrong pick', revealed: 'nobody got it' };

export function Summary({ state, setup, onAgain, onSettings, onHome }: Props) {
  const summary = useMemo(() => buildSummary(state), [state]);
  const [sel, setSel] = useState(summary[0]?.playerId ?? '');
  const me = summary.find((s) => s.playerId === sel) ?? summary[0];
  const [copied, setCopied] = useState(false);
  const winners = summary.filter((s) => s.winner);
  const groups = me ? groupStudyItems(me.missed) : [];
  const fileBase = `nerve-party-${(me?.name ?? 'study').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const headline = state.solo
    ? `${summary[0]?.correct ?? 0} correct`
    : winners.length === 1
      ? `${winners[0]!.name} wins`
      : winners.length > 1
        ? `${winners.map((w) => w.name).join(' & ')} tie`
        : 'Game over';

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <section className="text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-mute">{state.solo ? 'Solo practice' : 'Winner'}</div>
        <h1 className="glow-text mt-2 font-display text-5xl font-semibold text-pulse">{headline}</h1>
        <p className="mt-2 text-sm text-mute">
          {state.endedReason === 'exhausted' ? 'You went through every question in play.' : state.endedReason === 'solo_out' ? 'Out of myelin. Here’s what to review.' : setup.deck.name}
        </p>
      </section>

      {!state.solo && (
        <ol className="mx-auto mt-6 grid max-w-xl gap-2">
          {summary.map((p) => (
            <li key={p.playerId} className={`panel flex items-center gap-3 px-4 py-2.5 ${p.winner ? 'border-pulse/50' : ''}`}>
              <span className="w-6 text-sm font-semibold text-mute">#{p.rank}</span>
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="text-sm text-mute">
                {p.correct} correct · fired {p.fires}× · {p.lives} {p.lives === 1 ? 'life' : 'lives'} left
              </span>
            </li>
          ))}
        </ol>
      )}

      <section className="panel mt-8 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Study list</h2>
          {summary.length > 1 && (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Player">
              {summary.map((p) => (
                <button key={p.playerId} role="tab" aria-selected={p.playerId === me?.playerId} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${p.playerId === me?.playerId ? 'bg-panel-2 text-pulse' : 'text-mute hover:text-ink'}`} onClick={() => setSel(p.playerId)}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {me && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line p-3">
              {(() => {
                const pr = getDeckProgress(me.name, setup.deck);
                return (
                  <>
                    <ProgressRing seen={pr.seenRatio} mastered={pr.masteredRatio} size={52} />
                    <div className="text-sm">
                      <div className="font-semibold">{me.name} on this deck</div>
                      <div className="text-mute">
                        {pr.mastered}/{pr.total} mastered · {pr.seen}/{pr.total} seen
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="ml-auto flex flex-wrap gap-2">
                <button className="btn px-3 py-1.5 text-sm" onClick={() => downloadText(`${fileBase}.md`, summaryToMarkdown(me, `Nerve Party — ${setup.deck.name}`), 'text/markdown')}>
                  Download list
                </button>
                <button className="btn px-3 py-1.5 text-sm" onClick={() => downloadText(`${fileBase}.csv`, summaryToCsv(me), 'text/csv')}>
                  Spreadsheet (.csv)
                </button>
                <button
                  className="btn px-3 py-1.5 text-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(summaryToMarkdown(me, `Nerve Party — ${setup.deck.name}`));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard blocked */
                    }
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="mt-6 text-center text-mute">Nothing missed — clean run.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {groups.map((g) => (
                  <li key={g.prompt} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{g.prompt}</p>
                      <span className="shrink-0 text-xs text-mute">{g.reasons.map((r) => REASON[r]).join(', ')}</span>
                    </div>
                    <p className="mt-1 text-sm text-pulse-2">{g.answers.join(' · ')}</p>
                    <p className="mt-0.5 text-xs text-dim">{g.topic}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button className="btn btn-primary px-6" onClick={onAgain} autoFocus>
          Play again
        </button>
        <button className="btn" onClick={onSettings}>
          Change settings
        </button>
        <button className="btn btn-ghost" onClick={onHome}>
          Home
        </button>
      </div>
    </div>
  );
}

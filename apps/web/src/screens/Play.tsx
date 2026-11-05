import { useEffect, useMemo, useRef } from 'react';
import { continuePriorities, viewGame, type EngineContext, type GameState } from '@nerve/engine';
import { Feed } from '../components/Feed';
import { QuestionCard } from '../components/QuestionCard';
import { Reveal } from '../components/Reveal';
import { Stage } from '../components/stage/Stage';
import { useFrameNow, useLocalGame, type LocalGameConfig } from '../game/useLocalGame';
import { loadProgress, recordGame, rememberNames } from '../lib/progress';
import type { GameSetup } from './Setup';

interface Props {
  setup: GameSetup;
  reduced: boolean;
  onFinish: (state: GameState, ctx: EngineContext) => void;
  onQuit: () => void;
}

export function Play({ setup, reduced, onFinish, onQuit }: Props) {
  const config = useMemo<LocalGameConfig>(() => {
    const players = setup.players.map((name, i) => ({ id: `p${i + 1}`, name }));
    const engineOptions =
      setup.learning === 'continue'
        ? { priorityOf: continuePriorities(setup.deck.questions, setup.players.map((p) => loadProgress(p, setup.deck.id))), topicOrder: setup.deck.topics }
        : { topicOrder: setup.deck.topics };
    return { questions: setup.deck.questions, players, settings: setup.settings, engineOptions };
  }, [setup]);

  const recorded = useRef(false);
  const game = useLocalGame(config, (fx, state) => {
    if (fx.some((e) => e.type === 'gameOver') && !recorded.current) {
      recorded.current = true;
      recordGame(state, setup.deck.id);
      rememberNames(setup.players);
    }
  });
  const { state, ctx } = game;
  const live = state.status === 'playing' || state.status === 'interlude';
  const now = useFrameNow(live);
  const view = viewGame(ctx, state, now, 0.005);

  // Go to the summary shortly after the game ends.
  useEffect(() => {
    if (state.status !== 'over') return;
    const t = setTimeout(() => onFinish(state, ctx), reduced ? 300 : 1600);
    return () => clearTimeout(t);
  }, [state, ctx, onFinish, reduced]);

  // Enter / Space starts the game; Space continues past reveals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.status === 'lobby' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        game.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status, game]);

  const holder = view.players.find((p) => p.id === view.holderId);
  const fb = state.feedback;
  const fire = fb && (fb.kind === 'fired' || fb.kind === 'wrong_choice') ? { playerId: fb.playerId, at: fb.at } : null;
  const firedName = fire ? view.players.find((p) => p.id === fire.playerId)?.name : undefined;
  const nextName = view.interlude?.kind === 'fired' ? view.players.find((p) => p.id === state.interlude?.nextHolderId)?.name : undefined;
  // You sit at the front. In pass-the-device, the ring turns so whoever's turn it is is at the front.
  const viewerId = view.solo ? (view.players[0]?.id ?? null) : view.holderId;

  const endEarly = () => {
    if (state.status === 'lobby') return onQuit();
    if (!confirm('End this game now? Your study list so far will be shown.')) return;
    if (!recorded.current) {
      recorded.current = true;
      recordGame(state, setup.deck.id);
    }
    onFinish(state, ctx);
  };

  return (
    <div className="mx-auto max-w-6xl px-3 pb-10 pt-2 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-sm text-mute">
          <span className="font-semibold text-ink">{setup.deck.name}</span>
          <span className="mx-2 text-dim">·</span>
          {view.phaseKind === 'list' ? 'List round' : view.phaseKind === 'single' ? 'Single questions' : 'Ready'}
        </div>
        <button className="btn btn-ghost shrink-0 whitespace-nowrap px-3 py-1.5 text-sm" onClick={endEarly}>
          End game
        </button>
      </div>

      <div className="relative overflow-hidden rounded-[2rem] border-2 border-line bg-[radial-gradient(ellipse_at_50%_38%,#13213d_0%,#0a1122_45%,#04060c_100%)] shadow-[0_20px_60px_-20px_#000]">
        <Stage players={view.players} holderId={view.holderId} viewerId={viewerId} potential={view.potential} now={now} fire={fire} idle={state.status === 'lobby'} reduced={reduced} zapped={view.interlude?.kind === 'fired' || (state.status === 'over' && !!fire)} />
        <div className="pointer-events-none absolute inset-x-0 top-2 text-center font-display text-sm sm:top-3 sm:text-lg" aria-live="polite">
          {state.status === 'playing' && holder && (
            <span className="rounded-full bg-bg/70 px-4 py-1.5 backdrop-blur">
              {view.solo ? <span className="text-pulse">Your turn</span> : <><span className="text-pulse">{holder.name}</span> <span className="text-mute">has the signal</span></>}
            </span>
          )}
          {view.interlude?.kind === 'fired' && (
            <span className="rounded-full bg-bg/70 px-4 py-1.5 backdrop-blur">
              <span className="text-fire">⚡ {firedName} fired!</span>
              <span className="text-mute"> −1 life{nextName ? ` · next: ${nextName}` : ''}</span>
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto mt-5 grid max-w-6xl items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {state.status === 'lobby' && (
            <section className="panel p-6 text-center">
              <h2 className="font-display text-2xl font-semibold">Ready?</h2>
              <p className="mx-auto mt-2 max-w-md text-mute">
                Hold the signal, answer before the dial hits <b className="text-ink">−55 mV</b>. Get it right and the impulse jumps to the next
                player. Too slow and you fire — and lose a myelin segment.
              </p>
              <button className="btn btn-primary mt-5 px-10 py-3 text-xl" onClick={game.start} autoFocus>
                Start
              </button>
              <p className="mt-2 text-xs text-dim">or press Enter</p>
            </section>
          )}

          {view.question && state.status !== 'lobby' && (
            <div className={view.interlude?.kind === 'fired' ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'}>
              <QuestionCard
                question={view.question}
                holderName={holder?.name ?? ''}
                showTurnBanner={!view.solo}
                feedback={state.feedback && state.feedback.playerId === state.holderId && state.feedback.at >= state.turnStartedAt ? state.feedback : null}
                onSubmit={game.submit}
                disabled={state.status !== 'playing'}
              />
            </div>
          )}

          {state.status === 'over' && (
            <section className="panel p-6 text-center">
              <h2 className="font-display text-2xl font-semibold">Game over</h2>
              <p className="mt-1 text-sm text-mute">Loading your study summary…</p>
            </section>
          )}
        </div>

        {state.status !== 'lobby' && (
          <div>
            {!view.solo ? (
              <Feed feed={view.feed} players={view.players} />
            ) : (
              <section className="panel p-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mute">Correct</div>
                <div className="font-display text-4xl font-semibold text-pulse">{view.players[0]?.correct ?? 0}</div>
              </section>
            )}
          </div>
        )}
      </div>

      {view.interlude?.kind === 'reveal' && view.interlude.reveal && (
        <Reveal reveal={view.interlude.reveal} players={view.players} msLeft={view.interlude.msLeft} totalMs={view.interlude.totalMs} onContinue={game.skip} />
      )}
    </div>
  );
}

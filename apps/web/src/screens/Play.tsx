import { useEffect, useMemo, useRef } from 'react';
import { continuePriorities, viewGame, type EngineContext, type GameState } from '@nerve/engine';
import { Feed } from '../components/Feed';
import { QuestionCard } from '../components/QuestionCard';
import { Reveal } from '../components/Reveal';
import { Ring } from '../components/Ring';
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
  const firedId = view.interlude?.kind === 'fired' ? view.interlude.firedPlayerId : state.status === 'over' ? state.feedback?.playerId : undefined;
  const firedRecently = state.feedback && (state.feedback.kind === 'fired' || state.feedback.kind === 'wrong_choice') && now - state.feedback.at < 1800;
  const firingPlayer = firedId ?? (firedRecently ? state.feedback?.playerId : undefined);
  const firing = firingPlayer ? { playerId: firingPlayer, name: view.players.find((p) => p.id === firingPlayer)?.name ?? '' } : null;

  const nextName = view.interlude?.kind === 'fired' ? view.players.find((p) => p.id === state.interlude?.nextHolderId)?.name : undefined;

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
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6">
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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:gap-6">
        <div className="flex flex-col items-center">
          <Ring players={view.players} holderId={view.holderId} potential={view.potential} mv={view.potentialMv} firing={firing} reduced={reduced} idle={state.status === 'lobby'} />
          <p className="mt-1 h-6 text-center text-sm lg:-mt-2" aria-live="polite">
            {state.status === 'playing' && holder && (
              <>
                {view.solo ? (
                  <span className="font-semibold text-pulse">Your turn</span>
                ) : (
                  <>
                    <span className="font-semibold text-pulse">{holder.name}</span> <span className="text-mute">has the signal</span>
                  </>
                )}
              </>
            )}
            {view.interlude?.kind === 'fired' && (
              <>
                <span className="font-semibold text-fire">{firing?.name} fired</span>
                <span className="text-mute"> · −1 life{nextName ? ` · next: ${nextName}` : ''}</span>
              </>
            )}
          </p>
        </div>

        <div className="space-y-4">
          {state.status === 'lobby' && (
            <section className="panel p-6 text-center">
              <h2 className="text-xl font-semibold">Ready?</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-mute">
                The membrane climbs toward threshold while you hold the signal. Answer in time and it jumps to the next node. If it hits
                −55 mV on your turn, you fire and lose a myelin segment.
              </p>
              <button className="btn btn-primary mt-5 px-8 py-3 text-lg" onClick={game.start} autoFocus>
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
              <h2 className="text-xl font-semibold">Game over</h2>
              <p className="mt-1 text-sm text-mute">Loading your study summary…</p>
            </section>
          )}

          {!view.solo && state.status !== 'lobby' && <Feed feed={view.feed} players={view.players} />}
          {view.solo && state.status !== 'lobby' && (
            <p className="text-center text-sm text-mute">
              Correct so far: <span className="font-semibold text-ink">{view.players[0]?.correct ?? 0}</span>
            </p>
          )}
        </div>
      </div>

      {view.interlude?.kind === 'reveal' && view.interlude.reveal && (
        <Reveal reveal={view.interlude.reveal} players={view.players} msLeft={view.interlude.msLeft} totalMs={view.interlude.totalMs} onContinue={game.skip} />
      )}
    </div>
  );
}

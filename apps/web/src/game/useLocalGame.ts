import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEngine, type Effect, type EngineOptions, type GameState, type PlayerInit, type Submission } from '@nerve/engine';
import type { GameSettingsInput, Question } from '@nerve/shared';

export interface LocalGameConfig {
  questions: Question[];
  players: PlayerInit[];
  settings: GameSettingsInput;
  engineOptions?: EngineOptions;
}

/**
 * Runs the pure engine in the browser (solo + hot-seat). The engine tells us the
 * next deadline via a `schedule` effect; we set one timer for it.
 */
export function useLocalGame(config: LocalGameConfig, onEffects?: (fx: Effect[], state: GameState) => void) {
  const engine = useMemo(() => createEngine(config.questions, config.engineOptions), [config]);
  const [state, setState] = useState<GameState>(() => engine.init(config.players, config.settings));
  const stateRef = useRef(state);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFx = useRef(onEffects);
  onFx.current = onEffects;

  const dispatch = useCallback(
    (build: (now: number) => Parameters<typeof engine.reduce>[1]) => {
      const now = Date.now();
      const r = engine.reduce(stateRef.current, build(now));
      stateRef.current = r.state;
      setState(r.state);
      for (const e of r.effects) {
        if (e.type !== 'schedule') continue;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        if (e.at !== null) {
          timer.current = setTimeout(() => dispatch((t) => ({ type: 'tick', now: t })), Math.max(0, e.at - Date.now()) + 5);
        }
      }
      onFx.current?.(r.effects, r.state);
    },
    [engine],
  );

  // New config → new game.
  useEffect(() => {
    const s = engine.init(config.players, config.settings);
    stateRef.current = s;
    setState(s);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [engine, config]);

  return {
    ctx: engine.ctx,
    state,
    start: () => dispatch((now) => ({ type: 'start', now })),
    submit: (submission: Submission) => {
      const holder = stateRef.current.holderId;
      if (holder) dispatch((now) => ({ type: 'submit', playerId: holder, submission, now }));
    },
    skip: () => dispatch((now) => ({ type: 'continue', now })),
    removePlayer: (playerId: string) => dispatch((now) => ({ type: 'removePlayer', playerId, now })),
  };
}

/** Current time, updated every animation frame while `active`. */
export function useFrameNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

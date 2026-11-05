import { useCallback, useState } from 'react';
import type { EngineContext, GameState } from '@nerve/engine';
import { Logo } from './components/Logo';
import { usePrefs, useReducedMotion } from './lib/prefs';
import { load, save } from './lib/storage';
import { Home } from './screens/Home';
import { Play } from './screens/Play';
import { Setup, type GameSetup } from './screens/Setup';
import { Summary } from './screens/Summary';

type Screen =
  | { name: 'home' }
  | { name: 'setup'; kind: 'solo' | 'hotseat'; initial?: GameSetup }
  | { name: 'play'; setup: GameSetup; run: number }
  | { name: 'summary'; setup: GameSetup; state: GameState; ctx: EngineContext };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [prefs, setPrefs] = usePrefs();
  const reduced = useReducedMotion(prefs.reducedMotion);
  const [profile, setProfileState] = useState(() => load<string>('np.profile.v1', 'You'));
  const setProfile = (p: string) => {
    setProfileState(p);
    save('np.profile.v1', p);
  };
  const [deckId, setDeckIdState] = useState(() => load<string>('np.deck.v1', 'sample-upper-limb-abdominal-wall'));
  const setDeckId = (id: string) => {
    setDeckIdState(id);
    save('np.deck.v1', id);
  };

  const finish = useCallback((state: GameState, ctx: EngineContext) => {
    setScreen((s) => (s.name === 'play' ? { name: 'summary', setup: s.setup, state, ctx } : s));
  }, []);

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <button className="flex items-center gap-2 rounded-lg" onClick={() => (screen.name === 'play' ? undefined : setScreen({ name: 'home' }))} aria-label="Nerve Party home">
          <Logo />
          <span className="font-semibold tracking-tight">Nerve Party</span>
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-mute">
          <input type="checkbox" className="accent-[#5ce1ff]" checked={prefs.reducedMotion} onChange={(e) => setPrefs({ reducedMotion: e.target.checked })} />
          Reduce motion
        </label>
      </header>

      <main>
        {screen.name === 'home' && <Home profile={profile} setProfile={setProfile} deckId={deckId} setDeckId={setDeckId} onPlay={(kind) => setScreen({ name: 'setup', kind })} />}
        {screen.name === 'setup' && (
          <Setup
            kind={screen.kind}
            profile={profile}
            deckId={deckId}
            setDeckId={setDeckId}
            initial={screen.initial}
            onBack={() => setScreen({ name: 'home' })}
            onStart={(setup) => {
              if (setup.kind === 'solo' && setup.players[0]) setProfile(setup.players[0]);
              setScreen({ name: 'play', setup, run: Date.now() });
            }}
          />
        )}
        {screen.name === 'play' && <Play key={screen.run} setup={screen.setup} reduced={reduced} onFinish={finish} onQuit={() => setScreen({ name: 'setup', kind: screen.setup.kind, initial: screen.setup })} />}
        {screen.name === 'summary' && (
          <Summary
            state={screen.state}
            setup={screen.setup}
            onAgain={() => setScreen({ name: 'play', setup: { ...screen.setup }, run: Date.now() })}
            onSettings={() => setScreen({ name: 'setup', kind: screen.setup.kind, initial: screen.setup })}
            onHome={() => setScreen({ name: 'home' })}
          />
        )}
      </main>
    </div>
  );
}

import { useRef, useState } from 'react';
import type { Deck } from '@nerve/shared';
import { ProgressRing } from '../components/ProgressRing';
import { Mascot } from '../components/stage/Mascot';
import { useFrameNow } from '../game/useLocalGame';
import { allDecks, deleteImportedDeck, parseDeckJson, playableTopics, saveImportedDeck } from '../lib/decks';
import { getDeckProgress } from '../lib/progress';
import { downloadText } from '../lib/storage';

interface Props {
  profile: string;
  setProfile: (name: string) => void;
  deckId: string;
  setDeckId: (id: string) => void;
  onPlay: (kind: 'solo' | 'hotseat') => void;
  reduced: boolean;
}

export function Home({ profile, setProfile, deckId, setDeckId, onPlay, reduced }: Props) {
  const [decks, setDecks] = useState<Deck[]>(() => allDecks());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useFrameNow(!reduced);

  const importFile = async (file: File) => {
    setError(null);
    const { deck, error: err } = parseDeckJson(await file.text());
    if (!deck) return setError(err ?? 'Could not import deck.');
    saveImportedDeck(deck);
    setDecks(allDecks());
    setDeckId(deck.id);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <section className="mb-10 mt-2 text-center sm:mt-4">
        <svg viewBox="-130 -230 260 250" className="mx-auto h-36 w-36 sm:h-44 sm:w-44" aria-hidden>
          <Mascot potential={0.1} zapped={false} now={now} reduced={reduced} />
        </svg>
        <h1 className="-mt-2 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
          Nerve <span className="glow-text text-pulse">Party</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-mute">
          Pass the impulse around the ring. Answer before the membrane hits threshold — or fire and lose a life.
        </p>
      </section>

      <section aria-labelledby="play-h" className="mb-10">
        <h2 id="play-h" className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-mute">
          Play
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <ModeCard title="Solo practice" body="You vs the fuse. Great for drilling one deck." onClick={() => onPlay('solo')} primary />
          <ModeCard title="Pass the device" body="2–8 players sharing one screen. Hand it over on your turn." onClick={() => onPlay('hotseat')} />
          <ModeCard title="Online" body="Rooms with a join code, from different houses." soon />
        </div>
      </section>

      <section aria-labelledby="decks-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="decks-h" className="text-sm font-semibold uppercase tracking-[0.16em] text-mute">
            Decks
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-mute" htmlFor="profile">
              Progress for
            </label>
            <input id="profile" className="field w-40 py-1.5 text-sm" value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="Your name" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {decks.map((d) => {
            const pr = getDeckProgress(profile || 'You', d);
            const selected = d.id === deckId;
            const imported = d.id !== 'sample-upper-limb-abdominal-wall';
            return (
              <div key={d.id} className={`panel flex gap-4 p-4 transition ${selected ? 'border-pulse/60 shadow-[0_0_0_1px_#5ce1ff33,0_0_30px_#5ce1ff14]' : ''}`}>
                <ProgressRing seen={pr.seenRatio} mastered={pr.masteredRatio} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{d.name}</h3>
                    {selected ? <span className="chip border-pulse/50 text-pulse">Selected</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-mute">
                    {d.questions.length} questions · {playableTopics(d).length} topics · {pr.mastered} mastered · {pr.seen} seen
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!selected && (
                      <button className="btn px-3 py-1 text-sm" onClick={() => setDeckId(d.id)}>
                        Use this deck
                      </button>
                    )}
                    <button className="btn btn-ghost px-3 py-1 text-sm" onClick={() => downloadText(`${d.id}.json`, JSON.stringify(d, null, 2), 'application/json')}>
                      Export
                    </button>
                    {imported && (
                      <button
                        className="btn btn-ghost px-3 py-1 text-sm"
                        onClick={() => {
                          if (!confirm(`Delete “${d.name}” from this browser?`)) return;
                          deleteImportedDeck(d.id);
                          setDecks(allDecks());
                          if (selected) setDeckId('sample-upper-limb-abdominal-wall');
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="panel flex flex-col justify-center gap-2 border-dashed p-4">
            <p className="text-sm font-semibold">Add a deck</p>
            <p className="text-xs text-mute">Generating decks from your lecture notes is coming in the next update. For now you can import a deck file (.json).</p>
            <div>
              <button className="btn px-3 py-1 text-sm" onClick={() => fileRef.current?.click()}>
                Import .json
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            {error && (
              <p className="text-xs text-fire" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-dim">Outer ring = seen · inner ring = mastered. Progress is saved in this browser for now.</p>
      </section>
    </div>
  );
}

function ModeCard({ title, body, onClick, primary, soon }: { title: string; body: string; onClick?: () => void; primary?: boolean; soon?: boolean }) {
  return (
    <button
      className={`panel group p-5 text-left transition ${soon ? 'cursor-not-allowed opacity-50' : 'hover:border-pulse/60'} ${primary ? 'border-pulse/40' : ''}`}
      onClick={onClick}
      disabled={soon}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-xl font-semibold">{title}</span>
        {soon ? <span className="chip">Soon</span> : <span className="text-pulse transition group-hover:translate-x-0.5">→</span>}
      </div>
      <p className="mt-1.5 text-sm text-mute">{body}</p>
    </button>
  );
}

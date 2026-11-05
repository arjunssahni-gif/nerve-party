import { useMemo, useState, type ReactNode } from 'react';
import type { Deck, GameSettingsInput } from '@nerve/shared';
import { ProgressRing } from '../components/ProgressRing';
import { allDecks, playableTopics } from '../lib/decks';
import { getDeckProgress, recentNames, resetProgress } from '../lib/progress';
import { load, save } from '../lib/storage';

export interface GameSetup {
  kind: 'solo' | 'hotseat';
  deck: Deck;
  players: string[];
  settings: GameSettingsInput;
  learning: 'continue' | 'fresh';
}

interface Props {
  kind: 'solo' | 'hotseat';
  profile: string;
  deckId: string;
  setDeckId: (id: string) => void;
  initial?: GameSetup;
  onBack: () => void;
  onStart: (setup: GameSetup) => void;
}

const SETTINGS_KEY = 'np.lastSettings.v1';

const DEFAULTS = {
  mode: 'mixed' as 'list' | 'single' | 'mixed',
  singleOrder: 'shuffle' as 'shuffle' | 'continuous',
  lives: 2,
  fuseMin: 30,
  fuseMax: 60,
  turnStart: 15,
  turnEnd: 5,
  listMaxFires: 2,
  reveal: 7,
  bonusLives: true,
};

export function Setup({ kind, profile, deckId, setDeckId, initial, onBack, onStart }: Props) {
  const decks = useMemo(() => allDecks(), []);
  const deck = decks.find((d) => d.id === deckId) ?? decks[0]!;
  const topics = playableTopics(deck);

  const [opts, setOpts] = useState(() => ({ ...DEFAULTS, ...load<Partial<typeof DEFAULTS>>(SETTINGS_KEY, {}) }));
  const set = <K extends keyof typeof DEFAULTS>(k: K, v: (typeof DEFAULTS)[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const [players, setPlayers] = useState<string[]>(() => {
    if (initial?.kind === kind) return initial.players;
    if (kind === 'solo') return [profile || 'You'];
    const names = recentNames();
    return [names[0] ?? 'Player 1', names[1] ?? 'Player 2'];
  });
  const [selTopics, setSelTopics] = useState<string[]>(() => topics);
  const [tick, setTick] = useState(0); // re-read progress after reset

  const progress = useMemo(() => players.map((p) => ({ name: p, pr: getDeckProgress(p || '?', deck) })), [players, deck, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyProgress = progress.some((p) => p.pr.seen > 0);
  const [learning, setLearning] = useState<'continue' | 'fresh'>(initial?.learning ?? 'continue');

  const names = players.map((p) => p.trim());
  const lower = names.map((n) => n.toLowerCase());
  const dupes = new Set(names.filter((n, i) => n && lower.indexOf(n.toLowerCase()) !== i));
  const valid = names.every(Boolean) && dupes.size === 0 && selTopics.length > 0 && (kind === 'solo' || players.length >= 2);

  const topicQuestions = deck.questions.filter((q) => selTopics.includes(q.topic));
  const lists = topicQuestions.filter((q) => q.type === 'list').length;
  const singles = topicQuestions.length - lists;
  const modeOk = opts.mode === 'list' ? lists > 0 : opts.mode === 'single' ? singles > 0 : lists + singles > 0;

  const start = () => {
    save(SETTINGS_KEY, opts);
    const settings: GameSettingsInput = {
      mode: opts.mode,
      singleOrder: opts.singleOrder,
      lives: opts.lives,
      fuseMinMs: opts.fuseMin * 1000,
      fuseMaxMs: Math.max(opts.fuseMin, opts.fuseMax) * 1000,
      turnMinStartMs: opts.turnStart * 1000,
      turnMinEndMs: opts.turnEnd * 1000,
      listMaxFires: opts.listMaxFires,
      revealMs: opts.reveal * 1000,
      bonusLives: opts.bonusLives,
      topics: selTopics.length === topics.length ? null : selTopics,
    };
    onStart({ kind, deck, players: names, settings, learning: anyProgress ? learning : 'fresh' });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <button className="btn btn-ghost -ml-3 mb-4 text-sm" onClick={onBack}>
        ← Back
      </button>
      <h1 className="font-display text-3xl font-semibold">{kind === 'solo' ? 'Solo practice' : 'Pass the device'}</h1>
      <p className="mt-1 text-sm text-mute">{kind === 'solo' ? 'You vs the fuse.' : 'Everyone plays on this screen. The glowing node shows whose turn it is.'}</p>

      <div className="mt-6 space-y-4">
        <Card title="Deck">
          <select className="field" value={deck.id} onChange={(e) => setDeckId(e.target.value)} aria-label="Deck">
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.questions.length})
              </option>
            ))}
          </select>
        </Card>

        <Card title={kind === 'solo' ? 'Your name' : `Players (${players.length}/8)`}>
          <div className="space-y-2">
            {players.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`field ${dupes.has(p.trim()) ? 'border-fire' : ''}`}
                  value={p}
                  maxLength={20}
                  onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
                  aria-label={`Player ${i + 1} name`}
                />
                {kind === 'hotseat' && players.length > 2 && (
                  <button className="btn btn-ghost px-3" onClick={() => setPlayers(players.filter((_, j) => j !== i))} aria-label={`Remove player ${i + 1}`}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            {kind === 'hotseat' && players.length < 8 && (
              <button className="btn px-3 py-1.5 text-sm" onClick={() => setPlayers([...players, `Player ${players.length + 1}`])}>
                + Add player
              </button>
            )}
            {dupes.size > 0 && <p className="text-xs text-fire">Each player needs a different name (progress is saved by name).</p>}
          </div>
        </Card>

        <Card title="Progress on this deck">
          <div className="flex flex-wrap gap-4">
            {progress.map(({ name, pr }) => (
              <div key={name} className="flex items-center gap-3">
                <ProgressRing seen={pr.seenRatio} mastered={pr.masteredRatio} size={48} />
                <div className="text-sm">
                  <div className="font-semibold">{name || '—'}</div>
                  <div className="text-xs text-mute">
                    {pr.mastered}/{pr.total} mastered
                  </div>
                  {pr.seen > 0 && (
                    <button
                      className="text-xs text-dim underline hover:text-ink"
                      onClick={() => {
                        if (!confirm(`Reset ${name}'s progress on this deck?`)) return;
                        resetProgress(name, deck.id);
                        setTick((t) => t + 1);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {anyProgress && (
            <Segmented
              className="mt-4"
              value={learning}
              onChange={setLearning}
              options={[
                { value: 'continue', label: 'Continue learning', hint: 'Questions you haven’t mastered come first' },
                { value: 'fresh', label: 'Fresh run', hint: 'Everything, in normal order' },
              ]}
            />
          )}
        </Card>

        <Card title="Game">
          <Segmented
            value={opts.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'list', label: 'List', hint: 'Everyone names items from one list' },
              { value: 'single', label: 'Single', hint: 'Each player gets their own question' },
              { value: 'mixed', label: 'Mixed', hint: 'Alternate between the two' },
            ]}
          />
          {opts.mode !== 'list' && (
            <Segmented
              className="mt-3"
              value={opts.singleOrder}
              onChange={(v) => set('singleOrder', v)}
              options={[
                { value: 'shuffle', label: 'Shuffle', hint: 'Random questions from all selected material' },
                { value: 'continuous', label: 'Continuous', hint: 'Walk one structure in order (origin → insertion → …)' },
              ]}
            />
          )}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm">Lives (myelin segments)</span>
            <Stepper value={opts.lives} min={1} max={5} onChange={(v) => set('lives', v)} label="Lives" />
          </div>
          {!modeOk && <p className="mt-2 text-xs text-fire">No questions of that type in the selected topics.</p>}
        </Card>

        <Card title={`Topics (${selTopics.length}/${topics.length})`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {topics.map((t) => {
              const tp = progress[0]?.pr.byTopic[t];
              const on = selTopics.includes(t);
              return (
                <label key={t} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 ${on ? 'border-pulse/50 bg-pulse/5' : 'border-line'}`}>
                  <input type="checkbox" className="accent-[#5ce1ff]" checked={on} onChange={() => setSelTopics(on ? selTopics.filter((x) => x !== t) : [...selTopics, t])} />
                  <span className="flex-1 text-sm">{t}</span>
                  {tp && <ProgressRing size={30} seen={tp.seen / tp.total} mastered={tp.mastered / tp.total} label={`${tp.mastered} of ${tp.total} mastered`} />}
                </label>
              );
            })}
          </div>
        </Card>

        <details className="panel p-4">
          <summary className="cursor-pointer text-sm font-semibold text-mute">Timing & rules</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField label="Hidden fuse — min (s)" value={opts.fuseMin} min={5} max={180} onChange={(v) => set('fuseMin', v)} />
            <NumberField label="Hidden fuse — max (s)" value={opts.fuseMax} min={5} max={240} onChange={(v) => set('fuseMax', v)} />
            <NumberField label="Guaranteed time per turn — start (s)" value={opts.turnStart} min={1} max={60} onChange={(v) => set('turnStart', v)} />
            <NumberField label="Guaranteed time per turn — end (s)" value={opts.turnEnd} min={1} max={60} onChange={(v) => set('turnEnd', v)} />
            <NumberField label="End a list round after this many fires" value={opts.listMaxFires} min={1} max={10} onChange={(v) => set('listMaxFires', v)} />
            <NumberField label="Reveal screen (s)" value={opts.reveal} min={2} max={30} onChange={(v) => set('reveal', v)} />
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input type="checkbox" className="accent-[#5ce1ff]" checked={opts.bonusLives} onChange={(e) => set('bonusLives', e.target.checked)} />
              Bonus life (“remyelination”) for every 3 rare answers or hard questions
            </label>
            <button className="btn btn-ghost justify-start px-0 text-sm sm:col-span-2" onClick={() => setOpts({ ...DEFAULTS, mode: opts.mode, singleOrder: opts.singleOrder, lives: opts.lives })}>
              Reset timings to defaults
            </button>
          </div>
        </details>
      </div>

      <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-bg via-bg to-transparent pb-4 pt-6">
        <button className="btn btn-primary w-full py-3.5 text-lg" disabled={!valid || !modeOk} onClick={start}>
          Start game
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-mute">{title}</h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, onChange, options, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint: string }[]; className?: string }) {
  const current = options.find((o) => o.value === value);
  return (
    <div className={className}>
      <div role="radiogroup" className="grid gap-1 rounded-xl border border-line bg-bg-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${o.value === value ? 'bg-panel-2 text-pulse shadow-[inset_0_0_0_1px_#5ce1ff55]' : 'text-mute hover:text-ink'}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {current && <p className="mt-1.5 text-xs text-mute">{current.hint}</p>}
    </div>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button className="btn h-9 w-9 p-0" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
        −
      </button>
      <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button className="btn h-9 w-9 p-0" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
        +
      </button>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-mute">{label}</span>
      <input
        type="number"
        className="field"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v))));
        }}
      />
    </label>
  );
}

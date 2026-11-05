import { useEffect, useRef, useState } from 'react';
import { Reorder } from 'motion/react';
import type { Feedback, Option, QuestionView, Submission } from '@nerve/engine';

interface Props {
  question: QuestionView;
  holderName: string;
  /** Show "X's turn" (hot-seat). */
  showTurnBanner: boolean;
  feedback: Feedback | null;
  onSubmit: (s: Submission) => void;
  disabled: boolean;
}

const FORMAT_LABEL: Record<string, string> = {
  list: 'Everyone · name one',
  term: 'Your question',
  set: 'Your question · several parts',
  ordered: 'Your question · put in order',
  mc: 'Your question · multiple choice',
  tf: 'Your question · true or false',
};

export function QuestionCard({ question: q, holderName, showTurnBanner, feedback, onSubmit, disabled }: Props) {
  // Shake on every new rejection.
  const [shakeKey, setShakeKey] = useState(0);
  const lastSeq = useRef(0);
  const bad = feedback && ['wrong', 'already_used', 'ambiguous', 'wrong_order'].includes(feedback.kind);
  useEffect(() => {
    if (feedback && feedback.seq !== lastSeq.current) {
      lastSeq.current = feedback.seq;
      if (bad) setShakeKey((k) => k + 1);
    }
  }, [feedback, bad]);

  const fresh = feedback && Date.now() - feedback.at < 4000;

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="q-prompt">
      {showTurnBanner && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-pulse shadow-[0_0_12px_#5ce1ff]" aria-hidden />
          <span className="font-semibold text-pulse">{holderName}&apos;s turn</span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="chip">{q.topic}</span>
        <span className="chip">{FORMAT_LABEL[q.format] ?? 'Question'}</span>
        {q.cluster && (
          <span className="chip">
            {q.cluster.entity} · {q.cluster.facet}
          </span>
        )}
        {q.carry > 0 && (
          <span className="chip border-fire/50 text-fire-2" title="Someone ran out of time on this one">
            ↻ carried over · {q.carry} missed
          </span>
        )}
        {q.oneTry && (
          <span className="chip border-fire bg-fire/10 font-bold text-fire" role="note">
            <LockIcon /> ONE TRY
          </span>
        )}
      </div>

      <h2 id="q-prompt" className="text-xl font-semibold leading-snug sm:text-2xl">
        {q.prompt}
      </h2>

      {q.oneTry && <p className="mt-2 text-sm text-fire-2">A wrong pick fires immediately — you lose a life.</p>}

      {q.format === 'list' && <ListProgress q={q} />}
      {q.format === 'set' && (
        <p className="mt-3 text-sm text-mute">
          Parts: <span className="font-semibold text-ink">{q.partsDone.length}</span> / {q.partsTotal}
          {q.partsDone.length > 0 && <span className="ml-2 text-pulse">✓ {q.partsDone.join(', ')}</span>}
        </p>
      )}

      <div key={shakeKey} className={shakeKey ? 'shake mt-5' : 'mt-5'}>
        {(q.format === 'list' || q.format === 'term' || q.format === 'set') && (
          <TextAnswer key={q.id + ':' + holderName} onSubmit={(text) => onSubmit({ kind: 'text', text })} disabled={disabled} multi={q.format === 'set'} />
        )}
        {(q.format === 'mc' || q.format === 'tf') && q.options && (
          <Choices options={q.options} tf={q.format === 'tf'} onPick={(id) => onSubmit({ kind: 'choice', optionId: id })} disabled={disabled} />
        )}
        {q.format === 'ordered' && q.options && (
          <WordBank key={q.id + ':' + holderName} tiles={q.options} onSubmit={(seq) => onSubmit({ kind: 'order', sequence: seq })} disabled={disabled} />
        )}
      </div>

      <div className="mt-3 min-h-6 text-sm" aria-live="polite">
        {fresh && feedback && (
          <span className={bad || feedback.kind === 'wrong_choice' || feedback.kind === 'fired' ? 'text-fire' : 'text-pulse'}>
            {bad ? '✕ ' : ''}
            {feedback.message}
            {feedback.kind === 'wrong_order' && <span className="text-fire-2"> · voltage spiked</span>}
          </span>
        )}
      </div>

      <p className="mt-3 text-xs text-dim">
        Source: {q.sourceDeck}
        {q.sourceRef.slide ? ` · slide ${q.sourceRef.slide}` : q.sourceRef.page ? ` · p. ${q.sourceRef.page}` : ''}
      </p>
    </section>
  );
}

function ListProgress({ q }: { q: QuestionView }) {
  const used = q.listUsed ?? [];
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3 text-sm text-mute">
        <span>
          <span className="font-semibold text-ink">{used.length}</span> / {q.listTotal} named
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-pulse transition-[width] duration-300" style={{ width: `${(used.length / Math.max(1, q.listTotal ?? 1)) * 100}%` }} />
        </div>
      </div>
      {used.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Answers named so far">
          {used.map((u) => (
            <li key={u.text} className="rounded-md border border-pulse/25 bg-pulse/5 px-2 py-0.5 text-xs text-pulse-2">
              {u.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TextAnswer({ onSubmit, disabled, multi }: { onSubmit: (t: string) => void; disabled: boolean; multi: boolean }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || disabled) return;
        onSubmit(text);
        setText('');
        ref.current?.focus();
      }}
    >
      <input
        ref={ref}
        className="field text-lg"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={multi ? 'One part at a time, or separate with commas' : 'Type your answer…'}
        aria-label="Your answer"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
      />
      <button className="btn btn-primary shrink-0" type="submit" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
}

function Choices({ options, tf, onPick, disabled }: { options: Option[]; tf: boolean; onPick: (id: string) => void; disabled: boolean }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!disabled) first.current?.focus();
  }, [disabled, options]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (tf && (k === 't' || k === 'f')) onPick(k === 't' ? 'true' : 'false');
      const n = Number(k);
      if (!tf && n >= 1 && n <= options.length) onPick(options[n - 1]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, options, onPick, tf]);

  return (
    <div className={tf ? 'grid grid-cols-2 gap-3' : 'grid gap-2.5 sm:grid-cols-2'}>
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={i === 0 ? first : undefined}
          className="btn justify-start py-3.5 text-left font-medium"
          onClick={() => onPick(o.id)}
          disabled={disabled}
        >
          <kbd className="rounded border border-line-2 px-1.5 text-xs text-mute">{tf ? (o.id === 'true' ? 'T' : 'F') : i + 1}</kbd>
          <span>{o.text}</span>
          <span className="ml-auto text-fire/70" aria-hidden>
            <LockIcon />
          </span>
        </button>
      ))}
    </div>
  );
}

/** Click tiles to place them; drag (or ←/→ when focused) to reorder; click a placed tile to remove it. */
function WordBank({ tiles, onSubmit, disabled }: { tiles: Option[]; onSubmit: (ids: string[]) => void; disabled: boolean }) {
  const [placed, setPlaced] = useState<Option[]>([]);
  const bank = tiles.filter((t) => !placed.some((p) => p.id === t.id));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= placed.length) return;
    const next = [...placed];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setPlaced(next);
  };
  return (
    <div>
      <div className="rounded-xl border border-dashed border-line-2 p-3">
        <div className="mb-2 text-xs text-mute">Your order (first → last)</div>
        {placed.length === 0 ? (
          <div className="py-2 text-sm text-dim">Click tiles below to place them.</div>
        ) : (
          <Reorder.Group axis="y" values={placed} onReorder={setPlaced} className="flex flex-col gap-1.5">
            {placed.map((t, i) => (
              <Reorder.Item key={t.id} value={t} className="list-none">
                <div className="flex items-center gap-2 rounded-lg border border-pulse/30 bg-pulse/5 px-2 py-1.5">
                  <span className="w-5 text-center text-xs text-mute">{i + 1}</span>
                  <span className="cursor-grab text-dim" aria-hidden>
                    ⋮⋮
                  </span>
                  <button
                    className="flex-1 text-left text-sm"
                    onClick={() => setPlaced(placed.filter((p) => p.id !== t.id))}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        move(i, -1);
                      }
                      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        move(i, 1);
                      }
                    }}
                    aria-label={`${t.text}, position ${i + 1}. Click to remove, arrow keys to move.`}
                    disabled={disabled}
                  >
                    {t.text}
                  </button>
                  <button className="px-1 text-dim hover:text-ink" onClick={() => move(i, -1)} aria-label={`Move ${t.text} up`} disabled={disabled || i === 0}>
                    ↑
                  </button>
                  <button className="px-1 text-dim hover:text-ink" onClick={() => move(i, 1)} aria-label={`Move ${t.text} down`} disabled={disabled || i === placed.length - 1}>
                    ↓
                  </button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Word bank">
        {bank.map((t) => (
          <button key={t.id} className="btn px-3 py-1.5 text-sm font-medium" onClick={() => setPlaced([...placed, t])} disabled={disabled}>
            {t.text}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn btn-primary" onClick={() => onSubmit(placed.map((p) => p.id))} disabled={disabled || placed.length < 2}>
          Check order
        </button>
        {placed.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setPlaced([])} disabled={disabled}>
            Clear
          </button>
        )}
        <span className="text-xs text-mute">Wrong order spikes the voltage. Not every tile has to be used.</span>
      </div>
    </div>
  );
}

export function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

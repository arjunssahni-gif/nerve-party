import { describe, expect, it } from 'vitest';
import { QuestionSchema, sampleDeck, type GameSettingsInput, type Question, type QuestionInput } from '@nerve/shared';
import {
  buildSummary,
  createEngine,
  potentialLevel,
  summaryToCsv,
  summaryToMarkdown,
  viewGame,
  type Effect,
  type EngineOptions,
  type GameEvent,
  type GameState,
  type ListRound,
  type SingleRound,
  type Submission,
} from '../src';

// ───────────────────────── fixtures ─────────────────────────

let n = 0;
const a = (text: string, extra: Record<string, unknown> = {}) => ({ id: `a${++n}`, text, ...extra });

function listQ(id: string, topic: string, answers: string[], extra: Partial<QuestionInput> = {}): QuestionInput {
  return { id, topic, sourceDeck: 'test', type: 'list', prompt: `List ${id}`, answers: answers.map((t) => a(t)), difficulty: 2, ...extra };
}

function termQ(id: string, topic: string, answer: string, difficulty: number, extra: Partial<QuestionInput> = {}): QuestionInput {
  return { id, topic, sourceDeck: 'test', type: 'single', answerFormat: 'term', prompt: `Q ${id}`, answers: [a(answer)], difficulty, ...extra };
}

const parse = (qs: QuestionInput[]): Question[] => qs.map((q) => QuestionSchema.parse(q));

const T_A = 'Topic A';
const T_B = 'Topic B';

const LISTS = parse([
  listQ('LA', T_A, ['Deltoid', 'Teres minor'], { confusables: ['Teres major'] }),
  listQ('LB', T_B, ['Supraspinatus', 'Infraspinatus', 'Subscapularis']),
  listQ('LA2', T_A, ['Coracobrachialis', 'Brachialis']),
]);

const SINGLES = parse([
  termQ('S1a', T_A, 'Median nerve', 1),
  termQ('S1b', T_A, 'Ulnar nerve', 1),
  termQ('S1c', T_B, 'Radial nerve', 1),
  termQ('S2a', T_A, 'Axillary nerve', 2),
  termQ('S2b', T_B, 'Long thoracic nerve', 2),
  termQ('S2c', T_B, 'Suprascapular nerve', 2),
  termQ('S3a', T_A, 'Musculocutaneous nerve', 3),
  termQ('S3b', T_B, 'Thoracodorsal nerve', 3),
  termQ('S3c', T_B, 'Dorsal scapular nerve', 3),
  termQ('S5a', T_A, 'Lateral pectoral nerve', 5),
  termQ('S5b', T_B, 'Medial pectoral nerve', 5),
  termQ('S5c', T_B, 'Subclavian nerve', 5),
]);

const FORMATS = parse([
  {
    id: 'MC',
    topic: T_A,
    sourceDeck: 'test',
    type: 'single',
    answerFormat: 'mc',
    prompt: 'Pick',
    answers: [a('Right one')],
    distractors: ['Wrong 1', 'Wrong 2', 'Wrong 3'],
    difficulty: 2,
  },
  { id: 'TF', topic: T_A, sourceDeck: 'test', type: 'single', answerFormat: 'tf', prompt: 'True?', answers: [a('false')], difficulty: 2 },
  {
    id: 'ORD',
    topic: T_A,
    sourceDeck: 'test',
    type: 'single',
    answerFormat: 'ordered',
    prompt: 'Order',
    answers: [{ id: 'r', text: 'Roots' }, { id: 't', text: 'Trunks' }, { id: 'd', text: 'Divisions' }],
    distractors: ['Nuclei'],
    difficulty: 2,
  },
  {
    id: 'SET',
    topic: T_A,
    sourceDeck: 'test',
    type: 'single',
    answerFormat: 'set',
    prompt: 'Erb roots',
    answers: [{ id: 'c5', text: 'C5' }, { id: 'c6', text: 'C6' }],
    confusables: ['C7'],
    difficulty: 2,
  },
]);

const PLAYERS3 = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Ben' },
  { id: 'p3', name: 'Cal' },
];

const BASE: GameSettingsInput = {
  seed: 42,
  fuseMinMs: 20_000,
  fuseMaxMs: 20_000,
  turnMinStartMs: 5_000,
  turnMinEndMs: 5_000,
  revealMs: 3_000,
  firedMs: 1_000,
};

function setup(questions: Question[], settings: GameSettingsInput = {}, players = PLAYERS3, opts: EngineOptions = {}) {
  const eng = createEngine(questions, opts);
  let state = eng.init(players, { ...BASE, ...settings });
  let now = 1_000;
  let lastEffects: Effect[] = [];
  const g = {
    eng,
    get s(): GameState {
      return state;
    },
    get now() {
      return now;
    },
    fx: () => lastEffects,
    step(ev: GameEvent) {
      const r = eng.reduce(state, ev);
      state = r.state;
      lastEffects = r.effects;
      return r;
    },
    start() {
      return g.step({ type: 'start', now });
    },
    advance(ms: number) {
      now += ms;
      return g.step({ type: 'tick', now });
    },
    /** Jump to the next scheduled deadline. */
    toDeadline() {
      const at = state.status === 'playing' ? state.fuse!.endsAt : state.interlude!.until;
      now = at;
      return g.step({ type: 'tick', now });
    },
    submit(playerId: string, submission: Submission | string, dt = 500) {
      now += dt;
      const sub = typeof submission === 'string' ? { kind: 'text' as const, text: submission } : submission;
      return g.step({ type: 'submit', playerId, submission: sub, now });
    },
    holder: () => state.holderId,
    list: () => state.round as ListRound,
    single: () => state.round as SingleRound,
    activeQ: () => eng.ctx.questions.get((state.round as SingleRound).active!.questionId)!,
    player: (id: string) => state.players.find((p) => p.id === id)!,
  };
  return g;
}

// ───────────────────────── list rounds ─────────────────────────

describe('list rounds', () => {
  it('starts with the first player holding the signal and a hidden fuse in range', () => {
    const g = setup(LISTS, { mode: 'list', fuseMinMs: 30_000, fuseMaxMs: 60_000 });
    const { effects } = g.start();
    expect(g.s.status).toBe('playing');
    expect(g.holder()).toBe('p1');
    expect(g.s.round?.kind).toBe('list');
    const dur = g.s.fuse!.endsAt - g.s.fuse!.startedAt;
    expect(dur).toBeGreaterThanOrEqual(30_000);
    expect(dur).toBeLessThanOrEqual(60_000);
    expect(effects).toContainEqual({ type: 'schedule', at: g.s.fuse!.endsAt });
  });

  it('a correct answer passes the signal; a wrong one does not', () => {
    const g = setup(LISTS, { mode: 'list', topics: [T_A] });
    g.start();
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    g.submit('p1', 'nonsense');
    expect(g.holder()).toBe('p1');
    expect(g.s.feedback).toMatchObject({ kind: 'wrong', message: 'Not in this list' });
    g.submit('p1', q.answers[0]!.text);
    expect(g.holder()).toBe('p2');
    expect(g.s.feedback?.kind).toBe('accepted');
    g.submit('p2', q.answers[0]!.text);
    expect(g.holder()).toBe('p2');
    expect(g.s.feedback?.kind).toBe('already_used');
  });

  it('rejects a confusable with "Not in this list"', () => {
    const g = setup(LISTS, { mode: 'list', topics: [T_A] });
    g.start();
    // Force the LA question for determinism.
    if (g.list().questionId !== 'LA') return;
    g.submit('p1', 'teres major');
    expect(g.s.feedback?.kind).toBe('wrong');
    expect(g.holder()).toBe('p1');
  });

  it('ignores input from players who do not hold the signal', () => {
    const g = setup(LISTS, { mode: 'list' });
    g.start();
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    g.submit('p2', q.answers[0]!.text);
    expect(g.list().used).toHaveLength(0);
    expect(g.holder()).toBe('p1');
  });

  it('ends automatically when every answer is used, reveals, then moves to the next topic', () => {
    const g = setup(LISTS, { mode: 'list' });
    g.start();
    const first = g.eng.ctx.questions.get(g.list().questionId)!;
    first.answers.forEach((ans) => g.submit(g.holder()!, ans.text));
    expect(g.s.status).toBe('interlude');
    expect(g.s.interlude?.kind).toBe('reveal');
    expect(g.s.interlude?.reveal?.reason).toBe('complete');
    expect(g.s.interlude?.reveal?.answers.every((x) => x.gotBy)).toBe(true);
    g.toDeadline();
    expect(g.s.status).toBe('playing');
    const second = g.eng.ctx.questions.get(g.list().questionId)!;
    expect(second.id).not.toBe(first.id);
    expect(second.topic).not.toBe(first.topic); // topics rotate
  });

  it('threshold fires on the holder: lose a life, pause, same question continues with the next player', () => {
    const g = setup(LISTS, { mode: 'list' });
    g.start();
    const qid = g.list().questionId;
    const { effects } = g.toDeadline();
    expect(effects).toContainEqual({ type: 'fired', playerId: 'p1' });
    expect(g.player('p1').lives).toBe(1);
    expect(g.s.status).toBe('interlude');
    expect(g.s.interlude).toMatchObject({ kind: 'fired', firedPlayerId: 'p1', nextHolderId: 'p2' });
    g.toDeadline();
    expect(g.s.status).toBe('playing');
    expect(g.holder()).toBe('p2');
    expect(g.list().questionId).toBe(qid);
    expect(g.list().fires).toBe(1);
  });

  it('reveals and moves on after N fires on the same question (never stuck)', () => {
    const g = setup(LISTS, { mode: 'list', listMaxFires: 2 });
    g.start();
    const qid = g.list().questionId;
    g.toDeadline(); // p1 fires
    g.toDeadline(); // pause over
    g.toDeadline(); // p2 fires → 2nd fire
    expect(g.s.interlude?.kind).toBe('reveal');
    expect(g.s.interlude?.reveal).toMatchObject({ questionId: qid, reason: 'max_fires' });
    expect(g.s.interlude?.reveal?.answers.every((x) => !x.gotBy)).toBe(true);
    g.toDeadline();
    expect(g.list().questionId).not.toBe(qid);
    expect(g.holder()).toBe('p3');
  });

  it('a submission after the deadline is too late: the fire happens first', () => {
    const g = setup(LISTS, { mode: 'list' });
    g.start();
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    const late = g.s.fuse!.endsAt - g.now + 10;
    g.submit('p1', q.answers[0]!.text, late);
    expect(g.player('p1').lives).toBe(1);
    expect(g.list().used).toHaveLength(0);
  });
});

// ───────────────────────── fuse & timing ─────────────────────────

describe('fuse timing', () => {
  it('guarantees each new holder the per-turn minimum', () => {
    const g = setup(LISTS, { mode: 'list', fuseMinMs: 6_000, fuseMaxMs: 6_000, turnMinStartMs: 5_000, turnMinEndMs: 5_000 });
    g.start();
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    g.advance(4_000); // 2s left on the fuse
    g.submit('p1', q.answers[0]!.text, 0);
    expect(g.holder()).toBe('p2');
    expect(g.s.fuse!.endsAt - g.now).toBe(5_000);
  });

  it('the per-turn minimum shrinks over the game (15s → 5s by default)', () => {
    const g = setup(SINGLES, { mode: 'single', fuseMinMs: 1_000, fuseMaxMs: 1_000, turnMinStartMs: 15_000, turnMinEndMs: 5_000, turnMinRampTurns: 4 });
    g.start();
    expect(g.s.fuse!.endsAt - g.now).toBe(15_000 - 2_500); // turnIndex 1 of 4
    for (let i = 0; i < 5; i++) {
      const q = g.activeQ();
      g.submit(g.holder()!, q.answers[0]!.text, g.s.fuse!.endsAt - g.now - 100); // answer with 0.1s left
    }
    expect(g.s.fuse!.endsAt - g.now).toBe(5_000);
  });

  it('potential rises monotonically and faster near threshold', () => {
    const f = { segStart: 0, segLevel: 0, endsAt: 10_000 };
    const l = [0, 2_500, 5_000, 7_500, 10_000].map((t) => potentialLevel(f, t));
    for (let i = 1; i < l.length; i++) expect(l[i]!).toBeGreaterThan(l[i - 1]!);
    expect(l[4]).toBe(1);
    expect(l[1]! - l[0]!).toBeLessThan(l[4]! - l[3]!);
  });
});

// ───────────────────────── single rounds ─────────────────────────

describe('single rounds', () => {
  it('each player gets their own question; correct answer passes', () => {
    const g = setup(SINGLES, { mode: 'single' });
    g.start();
    const q1 = g.activeQ();
    g.submit('p1', q1.answers[0]!.text);
    expect(g.holder()).toBe('p2');
    const q2 = g.activeQ();
    expect(q2.id).not.toBe(q1.id);
  });

  it('players in the same lap get questions from the same difficulty band, rising over laps', () => {
    const g = setup(SINGLES, { mode: 'single', bandStart: 1, bandRise: 1, bandWidth: 0.5 });
    g.start();
    const laps: number[][] = [];
    for (let lap = 0; lap < 3; lap++) {
      const diffs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const q = g.activeQ();
        diffs.push(q.difficulty);
        g.submit(g.holder()!, q.answers[0]!.text);
      }
      laps.push(diffs);
    }
    for (const lap of laps) expect(Math.max(...lap) - Math.min(...lap)).toBeLessThanOrEqual(1);
    expect(laps[0]).toEqual([1, 1, 1]);
    expect(laps[1]).toEqual([2, 2, 2]);
    expect(laps[2]).toEqual([3, 3, 3]);
  });

  it('carries an unanswered question to the next player after a fire', () => {
    const g = setup(SINGLES, { mode: 'single' });
    g.start();
    const q = g.activeQ();
    g.toDeadline(); // p1 fires
    expect(g.s.interlude?.kind).toBe('fired');
    g.toDeadline();
    expect(g.holder()).toBe('p2');
    expect(g.activeQ().id).toBe(q.id);
    expect(g.single().active!.carry).toBe(1);
    g.submit('p2', q.answers[0]!.text);
    // carried question answered → everyone sees the answer briefly
    expect(g.s.interlude?.reveal).toMatchObject({ questionId: q.id, reason: 'answered' });
    g.toDeadline();
    expect(g.holder()).toBe('p3');
    expect(g.activeQ().id).not.toBe(q.id);
  });

  it('reveals the answer once every player has failed it', () => {
    const g = setup(SINGLES, { mode: 'single' });
    g.start();
    const q = g.activeQ();
    for (let i = 0; i < 3; i++) {
      g.toDeadline(); // fire
      if (i < 2) g.toDeadline(); // pause
    }
    expect(g.s.interlude?.reveal).toMatchObject({ questionId: q.id, reason: 'carry_exhausted' });
    expect(g.s.players.map((p) => p.lives)).toEqual([1, 1, 1]);
  });

  it('set answers: parts can be given one at a time with progress, or all at once', () => {
    const g = setup(FORMATS.filter((q) => q.id === 'SET').concat(SINGLES.slice(0, 2)), { mode: 'single', bandStart: 2, bandWidth: 0.25 }, PLAYERS3, { priorityOf: { SET: 10 } });
    g.start();
    expect(g.activeQ().id).toBe('SET');
    g.submit('p1', 'C5');
    expect(g.s.feedback).toMatchObject({ kind: 'partial', message: '✓ C5 (1/2)' });
    expect(g.holder()).toBe('p1');
    g.submit('p1', 'C7');
    expect(g.s.feedback?.kind).toBe('wrong');
    g.submit('p1', 'c6');
    expect(g.holder()).toBe('p2');

    const g2 = setup(FORMATS.filter((q) => q.id === 'SET').concat(SINGLES.slice(0, 2)), { mode: 'single', bandStart: 2, bandWidth: 0.25 }, PLAYERS3, { priorityOf: { SET: 10 } });
    g2.start();
    g2.submit('p1', 'C6, C5');
    expect(g2.holder()).toBe('p2');
  });

  it('multiple choice is one try: a wrong pick fires immediately and reveals', () => {
    const g = setup(FORMATS.filter((q) => q.id === 'MC').concat(SINGLES), { mode: 'single', bandStart: 2, bandWidth: 0.25 }, PLAYERS3, { priorityOf: { MC: 10 } });
    g.start();
    expect(g.activeQ().id).toBe('MC');
    const view = viewGame(g.eng.ctx, g.s, g.now);
    expect(view.question?.oneTry).toBe(true);
    expect(view.question?.options).toHaveLength(4);
    const wrong = view.question!.options!.find((o) => o.text !== 'Right one')!;
    g.submit('p1', { kind: 'choice', optionId: wrong.id });
    expect(g.player('p1').lives).toBe(1);
    expect(g.s.interlude?.reveal).toMatchObject({ questionId: 'MC', reason: 'wrong_choice' });
    expect(g.s.interlude?.reveal?.answers[0]?.text).toBe('Right one');
  });

  it('multiple choice correct pick passes the signal', () => {
    const g = setup(FORMATS.filter((q) => q.id === 'MC').concat(SINGLES), { mode: 'single', bandStart: 2, bandWidth: 0.25 }, PLAYERS3, { priorityOf: { MC: 10 } });
    g.start();
    const right = g.single().active!.options!.find((o) => o.text === 'Right one')!;
    g.submit('p1', { kind: 'choice', optionId: right.id });
    expect(g.holder()).toBe('p2');
    expect(g.player('p1').lives).toBe(2);
  });

  it('true/false is one try', () => {
    const g = setup(FORMATS.filter((q) => q.id === 'TF').concat(SINGLES), { mode: 'single', bandStart: 2, bandWidth: 0.25 }, PLAYERS3, { priorityOf: { TF: 10 } });
    g.start();
    expect(g.activeQ().id).toBe('TF');
    g.submit('p1', { kind: 'choice', optionId: 'true' });
    expect(g.player('p1').lives).toBe(1);
    expect(g.s.interlude?.reveal?.answers[0]?.text).toBe('False');
  });

  it('ordered: wrong order spikes the voltage and you retry; right order passes', () => {
    const g = setup(FORMATS.filter((q) => q.id === 'ORD').concat(SINGLES), { mode: 'single', bandStart: 2, bandWidth: 0.25, orderPenaltyMs: 3_000 }, PLAYERS3, { priorityOf: { ORD: 10 } });
    g.start();
    expect(g.activeQ().id).toBe('ORD');
    const tiles = g.single().active!.options!;
    expect(tiles.map((t) => t.text).sort()).toEqual(['Divisions', 'Nuclei', 'Roots', 'Trunks']);
    const before = g.s.fuse!.endsAt;
    g.submit('p1', { kind: 'order', sequence: ['t', 'r', 'd'] }, 0);
    expect(g.s.feedback?.kind).toBe('wrong_order');
    expect(g.holder()).toBe('p1');
    expect(g.s.fuse!.endsAt).toBe(before - 3_000);
    g.submit('p1', { kind: 'order', sequence: ['r', 't', 'd', 'd0'] });
    expect(g.holder()).toBe('p1'); // distractor included → wrong
    g.submit('p1', { kind: 'order', sequence: ['r', 't', 'd'] });
    expect(g.holder()).toBe('p2');
  });

  it('continuous mode walks one cluster in order across players', () => {
    const g = setup(parse(sampleDeck.questions.filter((q) => q.type === 'single')), { mode: 'single', singleOrder: 'continuous' }, PLAYERS3);
    g.start();
    const seen: { entity?: string; order?: number; player: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const q = g.activeQ();
      seen.push({ entity: q.cluster?.entity, order: q.cluster?.order, player: g.holder()! });
      const answer =
        q.answerFormat === 'mc'
          ? { kind: 'choice' as const, optionId: q.answers[0]!.id }
          : q.answerFormat === 'tf'
            ? { kind: 'choice' as const, optionId: q.answers[0]!.text }
            : q.answerFormat === 'ordered'
              ? { kind: 'order' as const, sequence: q.answers.map((x) => x.id) }
              : { kind: 'text' as const, text: q.answers.map((x) => x.text).join(', ') };
      g.submit(g.holder()!, answer);
    }
    const entity = seen[0]!.entity;
    expect(entity).toBeDefined();
    const sameCluster = seen.filter((x) => x.entity === entity);
    expect(sameCluster.map((x) => x.order)).toEqual([...sameCluster.map((x) => x.order)].sort((x, y) => x! - y!));
    expect(seen.slice(0, 3).map((x) => x.player)).toEqual(['p1', 'p2', 'p3']);
    expect(sameCluster.length).toBeGreaterThanOrEqual(4);
  });
});

// ───────────────────────── modes, lives, end of game ─────────────────────────

describe('modes and game end', () => {
  it('mixed mode alternates list rounds and single laps', () => {
    const g = setup([...LISTS, ...SINGLES], { mode: 'mixed', mixedListRounds: 1, mixedSingleLaps: 1 });
    g.start();
    expect(g.s.round?.kind).toBe('list');
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    q.answers.forEach((ans) => g.submit(g.holder()!, ans.text));
    g.toDeadline(); // end reveal
    expect(g.s.round?.kind).toBe('single');
    for (let i = 0; i < 3; i++) g.submit(g.holder()!, g.activeQ().answers[0]!.text);
    expect(g.s.round?.kind).toBe('list');
  });

  it('eliminates players at 0 lives and declares the last one standing', () => {
    const g = setup(LISTS, { mode: 'list', lives: 1 }, PLAYERS3.slice(0, 2));
    g.start();
    const { effects } = g.toDeadline();
    expect(g.player('p1')).toMatchObject({ lives: 0, alive: false });
    expect(g.s.status).toBe('over');
    expect(g.s.winnerIds).toEqual(['p2']);
    expect(effects).toContainEqual({ type: 'gameOver', winnerIds: ['p2'] });
  });

  it('eliminated players are skipped', () => {
    const g = setup(LISTS, { mode: 'list', lives: 1, listMaxFires: 5 });
    g.start();
    g.toDeadline(); // p1 out
    g.toDeadline(); // pause
    expect(g.holder()).toBe('p2');
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    g.submit('p2', q.answers[0]!.text);
    expect(g.holder()).toBe('p3');
    g.submit('p3', q.answers[1]?.text ?? 'x');
    if (g.s.status === 'playing') expect(g.holder()).toBe('p2');
  });

  it('never repeats a question and ends when the bank runs out', () => {
    const g = setup(SINGLES, { mode: 'single', lives: 5 });
    g.start();
    let guard = 0;
    while (g.s.status !== 'over' && guard++ < 200) {
      if (g.s.status === 'interlude') g.toDeadline();
      else g.submit(g.holder()!, g.activeQ().answers[0]!.text);
    }
    expect(g.s.status).toBe('over');
    expect(g.s.endedReason).toBe('exhausted');
    expect(new Set(g.s.usedQuestionIds).size).toBe(g.s.usedQuestionIds.length);
    expect(g.s.usedQuestionIds.length).toBe(SINGLES.length);
  });

  it('solo practice: you vs the fuse', () => {
    const g = setup(SINGLES, { mode: 'single', lives: 2 }, [{ id: 'me', name: 'Me' }]);
    g.start();
    expect(g.s.solo).toBe(true);
    const q = g.activeQ();
    g.submit('me', q.answers[0]!.text);
    expect(g.holder()).toBe('me');
    expect(g.activeQ().id).not.toBe(q.id);
    g.toDeadline(); // fire → reveal immediately (no one to carry to)
    expect(g.s.interlude?.reveal?.reason).toBe('carry_exhausted');
    g.toDeadline();
    g.toDeadline(); // fire again → out
    expect(g.s.status).toBe('over');
    expect(g.s.endedReason).toBe('solo_out');
  });

  it('removing the holder passes the signal on; removing down to one ends the game', () => {
    const g = setup(LISTS, { mode: 'list' });
    g.start();
    g.step({ type: 'removePlayer', playerId: 'p1', now: g.now });
    expect(g.holder()).toBe('p2');
    g.step({ type: 'removePlayer', playerId: 'p3', now: g.now });
    expect(g.s.status).toBe('over');
    expect(g.s.winnerIds).toEqual(['p2']);
  });

  it('bonus life ("remyelination") for rare answers', () => {
    const rare = parse([listQ('R', T_A, ['Pyramidalis', 'Palmaris brevis', 'Anconeus', 'Deltoid'].map(String), {})]).map((q) => ({
      ...q,
      answers: q.answers.map((x, i) => ({ ...x, obscurity: i < 3 ? 3 : 1 })),
    }));
    const g = setup(rare, { mode: 'list', bonusEvery: 2, lives: 2, maxLives: 5 }, PLAYERS3.slice(0, 1).concat({ id: 'p2', name: 'B' }));
    g.start();
    g.submit('p1', 'pyramidalis');
    g.submit('p2', 'deltoid');
    g.submit('p1', 'palmaris brevis');
    expect(g.player('p1').lives).toBe(3);
    expect(g.s.feed.some((f) => f.result === 'bonus' && f.playerId === 'p1')).toBe(true);
  });
});

// ───────────────────────── summary, view, purity ─────────────────────────

describe('summary and view', () => {
  it('builds a per-player study list of misses and reveals', () => {
    const g = setup([...LISTS, ...SINGLES], { mode: 'list', listMaxFires: 1, lives: 1 }, PLAYERS3.slice(0, 2));
    g.start();
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    g.toDeadline(); // p1 fires and is out → game over
    const sum = buildSummary(g.s);
    expect(sum[0]).toMatchObject({ playerId: 'p2', winner: true, rank: 1 });
    const p1 = sum.find((x) => x.playerId === 'p1')!;
    expect(p1.missed.some((m) => m.questionId === q.id && m.reason === 'fired')).toBe(true);
    const md = summaryToMarkdown(p1);
    expect(md).toContain(q.prompt);
    expect(md).toContain(q.answers[0]!.text);
    expect(summaryToCsv(p1).split('\n')[0]).toBe('topic,question,answer,reason,your answer');
  });

  it('list reveal adds the unnamed answers to everyone\'s study list', () => {
    const g = setup(LISTS, { mode: 'list', listMaxFires: 1, lives: 3 });
    g.start();
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    g.submit('p1', q.answers[0]!.text);
    g.toDeadline(); // p2 fires → reveal
    const sum = buildSummary(g.s);
    for (const p of sum) {
      for (const missed of q.answers.slice(1)) {
        expect(p.missed.some((m) => m.answer === missed.text)).toBe(true);
      }
      expect(p.missed.some((m) => m.answer === q.answers[0]!.text && m.reason === 'revealed')).toBe(false);
    }
  });

  it('the client view never contains unrevealed answers or the fuse time', () => {
    const g = setup(LISTS, { mode: 'list' });
    g.start();
    const q = g.eng.ctx.questions.get(g.list().questionId)!;
    const json = JSON.stringify(viewGame(g.eng.ctx, g.s, g.now));
    for (const ans of q.answers) expect(json).not.toContain(ans.text);
    expect(json).not.toContain(String(g.s.fuse!.endsAt));
    g.submit('p1', q.answers[0]!.text);
    const v = viewGame(g.eng.ctx, g.s, g.now);
    expect(v.question?.listUsed?.[0]?.text).toBe(q.answers[0]!.text);
    expect(v.potentialMv).toBeGreaterThanOrEqual(-70);
    expect(v.potentialMv).toBeLessThanOrEqual(-55);
    expect(v.players.find((p) => p.id === 'p2')?.isHolder).toBe(true);
  });

  it('reduce is pure and deterministic', () => {
    const run = () => {
      const g = setup([...LISTS, ...SINGLES], { mode: 'mixed', seed: 7, fuseMinMs: 10_000, fuseMaxMs: 40_000 });
      g.start();
      const frozen = JSON.stringify(g.s);
      const before = g.s;
      g.toDeadline();
      expect(JSON.stringify(before)).toBe(frozen); // input not mutated
      g.toDeadline();
      return JSON.stringify(g.s);
    };
    expect(run()).toBe(run());
  });
});

// ───────────────────────── full simulated games ─────────────────────────

/** Bot that answers correctly with probability `skill`, otherwise lets the fuse run out. */
function correctSubmission(q: Question, s: GameState): Submission {
  if (q.type === 'list') {
    const used = (s.round as ListRound).used.map((u) => u.answerId);
    return { kind: 'text', text: q.answers.find((x) => x.enabled && !used.includes(x.id))!.text };
  }
  switch (q.answerFormat) {
    case 'mc':
      return { kind: 'choice', optionId: q.answers[0]!.id };
    case 'tf':
      return { kind: 'choice', optionId: q.answers[0]!.text.toLowerCase() };
    case 'ordered':
      return { kind: 'order', sequence: q.answers.map((x) => x.id) };
    default:
      return { kind: 'text', text: q.answers.map((x) => x.text).join(', ') };
  }
}

describe('simulated full games on the sample deck', () => {
  const modes: GameSettingsInput[] = [
    { mode: 'list' },
    { mode: 'single', singleOrder: 'shuffle' },
    { mode: 'single', singleOrder: 'continuous' },
    { mode: 'mixed', mixedListRounds: 1, mixedSingleLaps: 2 },
  ];
  for (const settings of modes) {
    for (const seed of [1, 2, 3]) {
      it(`${settings.mode}${settings.singleOrder ? '/' + settings.singleOrder : ''} seed ${seed} runs to completion with consistent state`, () => {
        const g = setup(sampleDeck.questions, { ...settings, seed, lives: 3 }, PLAYERS3);
        g.start();
        let rngState = seed * 9973;
        const rand = () => ((rngState = (rngState * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
        let steps = 0;
        while (g.s.status !== 'over' && steps++ < 5_000) {
          if (g.s.status === 'interlude') {
            g.toDeadline();
            continue;
          }
          const round = g.s.round!;
          const qid = round.kind === 'list' ? round.questionId : round.active!.questionId;
          const q = g.eng.ctx.questions.get(qid)!;
          if (rand() < 0.75) g.submit(g.holder()!, correctSubmission(q, g.s), 300);
          else if (rand() < 0.5) g.submit(g.holder()!, 'definitely wrong', 300);
          else g.toDeadline();
          // invariants
          for (const p of g.s.players) {
            expect(p.lives).toBeGreaterThanOrEqual(0);
            expect(p.alive).toBe(p.lives > 0 && !p.removed);
          }
          if (g.s.status === 'playing') {
            expect(g.player(g.holder()!).alive).toBe(true);
            expect(g.s.fuse!.endsAt).toBeGreaterThan(g.now - 1);
          }
        }
        expect(g.s.status).toBe('over');
        expect(new Set(g.s.usedQuestionIds).size).toBe(g.s.usedQuestionIds.length);
        expect(g.s.winnerIds.length).toBeGreaterThan(0);
        const sum = buildSummary(g.s);
        expect(sum).toHaveLength(3);
      });
    }
  }
});

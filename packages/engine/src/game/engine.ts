import { parseSettings, type GameSettingsInput, type Question } from '@nerve/shared';
import { buildMatchIndex, matchAnswer, splitParts, type MatchIndex, type MatchResult } from '../matcher';
import { bandCenter } from './difficulty';
import { pick, random, randomInt, shuffle } from './rng';
import type {
  ActiveQuestion,
  Effect,
  Feedback,
  FeedbackKind,
  GameEvent,
  GameState,
  ListRound,
  PlayerInit,
  PlayerState,
  ReduceResult,
  Reveal,
  RevealReason,
  SingleRound,
  Submission,
} from './types';

export interface EngineOptions {
  /** Calibrated difficulty per question id (defaults to the question's own estimate). */
  difficultyOf?: Record<string, number>;
  /** Higher = asked sooner ("continue learning": not-yet-mastered questions first). */
  priorityOf?: Record<string, number>;
  /** Observed rarity per `${questionId}:${answerId}` (1–3), overrides answer.obscurity. */
  rarityOf?: Record<string, number>;
  /** Topic play order (defaults to first appearance in the question list). */
  topicOrder?: string[];
}

export interface EngineContext {
  questions: Map<string, Question>;
  list: Question[];
  index: MatchIndex;
  topicOrder: string[];
  difficulty(q: Question): number;
  priority(q: Question): number;
  rarity(q: Question, answerId: string): number;
}

const MAX_FEED = 40;
const MIN_PENALTY_LEFT_MS = 750;

export function createContext(questions: readonly Question[], opts: EngineOptions = {}): EngineContext {
  const playable = questions.filter((q) => q.reviewStatus !== 'draft' && q.answers.some((a) => a.enabled));
  const topicOrder = opts.topicOrder?.length ? [...opts.topicOrder] : [];
  for (const q of playable) if (!topicOrder.includes(q.topic)) topicOrder.push(q.topic);
  return {
    questions: new Map(playable.map((q) => [q.id, q])),
    list: playable,
    index: buildMatchIndex(questions),
    topicOrder,
    difficulty: (q) => opts.difficultyOf?.[q.id] ?? q.difficulty,
    priority: (q) => opts.priorityOf?.[q.id] ?? 0,
    rarity: (q, answerId) => opts.rarityOf?.[`${q.id}:${answerId}`] ?? q.answers.find((a) => a.id === answerId)?.obscurity ?? 1,
  };
}

export function initGame(players: PlayerInit[], settingsInput: GameSettingsInput = {}): GameState {
  if (players.length < 1) throw new Error('need at least one player');
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('duplicate player ids');
  const settings = parseSettings(settingsInput);
  return {
    status: 'lobby',
    settings,
    rng: (settings.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0,
    players: players.map<PlayerState>((p) => ({
      id: p.id,
      name: p.name,
      lives: settings.lives,
      alive: true,
      removed: false,
      bonusProgress: 0,
      correct: 0,
      fires: 0,
    })),
    solo: players.length === 1,
    holderId: null,
    turnStartedAt: 0,
    turnIndex: 0,
    lapIndex: 0,
    fuse: null,
    phaseKind: null,
    phaseRounds: 0,
    round: null,
    usedQuestionIds: [],
    topicCursor: 0,
    interlude: null,
    feedback: null,
    feed: [],
    history: [],
    seq: 0,
    eliminations: 0,
    winnerIds: [],
  };
}

// ───────────────────────────── helpers ─────────────────────────────

class Run {
  fx: Effect[] = [];
  constructor(
    readonly ctx: EngineContext,
    readonly s: GameState,
  ) {}

  q(id: string): Question {
    const q = this.ctx.questions.get(id);
    if (!q) throw new Error(`unknown question ${id}`);
    return q;
  }

  player(id: string | null): PlayerState | undefined {
    return this.s.players.find((p) => p.id === id);
  }

  alivePlayers(): PlayerState[] {
    return this.s.players.filter((p) => p.alive && !p.removed);
  }

  /** Next alive player after `id` in seat order (may return `id` itself if it's the only one). */
  nextAlive(id: string | null): string | null {
    const ps = this.s.players;
    const start = Math.max(0, ps.findIndex((p) => p.id === id));
    for (let k = 1; k <= ps.length; k++) {
      const p = ps[(start + k) % ps.length]!;
      if (p.alive && !p.removed) return p.id;
    }
    return null;
  }

  /** `id` if still alive, else the next alive player. */
  resolveHolder(id: string | null): string | null {
    const p = this.player(id);
    if (p && p.alive && !p.removed) return p.id;
    return this.nextAlive(id);
  }

  seq(): number {
    return ++this.s.seq;
  }

  feedback(playerId: string, kind: FeedbackKind, message: string, at: number) {
    const f: Feedback = { seq: this.seq(), at, playerId, kind, message };
    this.s.feedback = f;
  }

  feed(playerId: string, text: string, result: 'accepted' | 'rejected' | 'fired' | 'bonus', at: number, note?: string) {
    this.s.feed.push({ seq: this.seq(), at, playerId, text, result, note });
    if (this.s.feed.length > MAX_FEED) this.s.feed.splice(0, this.s.feed.length - MAX_FEED);
  }

  history(e: Omit<import('./types').HistoryEntry, 'seq'>) {
    this.s.history.push({ ...e, seq: this.seq() });
  }

  // ─────────── fuse ───────────

  turnMinMs(): number {
    const st = this.s.settings;
    const t = Math.min(1, this.s.turnIndex / st.turnMinRampTurns);
    return Math.round(st.turnMinStartMs - (st.turnMinStartMs - st.turnMinEndMs) * t);
  }

  newFuse(now: number) {
    const st = this.s.settings;
    const dur = randomInt(this.s, st.fuseMinMs, st.fuseMaxMs);
    this.s.fuse = { startedAt: now, endsAt: now + dur, segStart: now, segLevel: 0 };
  }

  ensureTurnMinimum(now: number) {
    const f = this.s.fuse;
    if (!f) return;
    const min = this.turnMinMs();
    if (f.endsAt - now < min) {
      const lvl = potentialLevel(f, now);
      f.segStart = now;
      f.segLevel = lvl;
      f.endsAt = now + min;
    }
  }

  penalize(now: number, ms: number) {
    const f = this.s.fuse;
    if (!f || ms <= 0) return;
    const lvl = potentialLevel(f, now);
    f.segStart = now;
    f.segLevel = Math.min(0.95, lvl + 0.12);
    f.endsAt = Math.max(now + MIN_PENALTY_LEFT_MS, f.endsAt - ms);
  }

  // ─────────── question pools ───────────

  inPlay(q: Question): boolean {
    const topics = this.s.settings.topics;
    return !this.s.usedQuestionIds.includes(q.id) && (!topics || topics.includes(q.topic));
  }

  pool(type: 'list' | 'single'): Question[] {
    return this.ctx.list.filter((q) => q.type === type && this.inPlay(q));
  }

  /** Highest priority first, random among equals. */
  choose(qs: Question[]): Question | undefined {
    if (!qs.length) return undefined;
    const top = Math.max(...qs.map((q) => this.ctx.priority(q)));
    return pick(this.s, qs.filter((q) => this.ctx.priority(q) === top));
  }

  pickListQuestion(): Question | undefined {
    const pool = this.pool('list');
    if (!pool.length) return undefined;
    const topics = this.ctx.topicOrder;
    for (let k = 0; k < topics.length; k++) {
      const i = (this.s.topicCursor + k) % topics.length;
      const inTopic = pool.filter((q) => q.topic === topics[i]);
      const q = this.choose(inTopic);
      if (q) {
        this.s.topicCursor = (i + 1) % topics.length;
        return q;
      }
    }
    return this.choose(pool);
  }

  startLap(round: SingleRound) {
    const st = this.s.settings;
    if (round.lapsStarted > 0) this.s.lapIndex++;
    round.lapsStarted++;
    const center = bandCenter(this.s.lapIndex, st.bandStart, st.bandRise);
    const pool = this.pool('single');
    const need = Math.max(1, this.alivePlayers().length);
    let width = st.bandWidth;
    const count = (w: number) => pool.filter((q) => Math.abs(this.ctx.difficulty(q) - center) <= w).length;
    while (count(width) < need && width < 4) width += 0.5;
    round.band = { center, width };
    round.lapTurnsLeft = need;
  }

  clusterKey(q: Question): string {
    if (q.cluster) return `c:${q.cluster.id}`;
    const where = q.sourceRef.slide ?? q.sourceRef.page;
    return where !== undefined ? `s:${q.sourceDeck}:${where}` : `q:${q.id}`;
  }

  pickSingleQuestion(round: SingleRound): Question | undefined {
    const pool = this.pool('single');
    if (!pool.length) return undefined;
    const { center, width } = round.band;
    const dist = (q: Question) => Math.abs(this.ctx.difficulty(q) - center);

    if (this.s.settings.singleOrder === 'continuous') {
      round.clusterQueue = round.clusterQueue.filter((id) => pool.some((q) => q.id === id));
      if (!round.clusterQueue.length) {
        const groups = new Map<string, Question[]>();
        for (const q of pool) {
          const k = this.clusterKey(q);
          let g = groups.get(k);
          if (!g) groups.set(k, (g = []));
          g.push(q);
        }
        const topicIdx = (t: string) => {
          const i = this.ctx.topicOrder.indexOf(t);
          const n = this.ctx.topicOrder.length || 1;
          return (i - this.s.topicCursor + n) % n;
        };
        const scored = [...groups.entries()].map(([key, qs]) => {
          const avg = qs.reduce((n, q) => n + this.ctx.difficulty(q), 0) / qs.length;
          const prio = Math.max(...qs.map((q) => this.ctx.priority(q)));
          // Prefer real multi-question clusters, then topic order, then the band.
          return { key, qs, score: [-prio, qs.length > 1 ? 0 : 1, topicIdx(qs[0]!.topic), Math.abs(avg - center), random(this.s)] };
        });
        scored.sort((a, b) => {
          for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return a.score[i]! - b.score[i]!;
          return 0;
        });
        const best = scored[0]!;
        round.clusterKey = best.key;
        round.clusterQueue = best.qs
          .sort((a, b) => (a.cluster?.order ?? 0) - (b.cluster?.order ?? 0) || a.id.localeCompare(b.id))
          .map((q) => q.id);
        const ti = this.ctx.topicOrder.indexOf(best.qs[0]!.topic);
        if (ti >= 0) this.s.topicCursor = ti;
      }
      const id = round.clusterQueue.shift()!;
      return this.q(id);
    }

    const inBand = pool.filter((q) => dist(q) <= width + 1e-9);
    if (inBand.length) return this.choose(inBand);
    // Band exhausted mid-lap: closest available.
    const minD = Math.min(...pool.map(dist));
    return this.choose(pool.filter((q) => dist(q) === minD));
  }

  makeActive(q: Question, now: number): ActiveQuestion {
    const a: ActiveQuestion = { questionId: q.id, carry: 0, progress: [], wrongTries: 0, askedAt: now };
    if (q.answerFormat === 'mc') {
      a.options = shuffle(this.s, [
        { id: q.answers[0]!.id, text: q.answers[0]!.text },
        ...q.distractors.map((d, i) => ({ id: `d${i}`, text: d })),
      ]);
    } else if (q.answerFormat === 'tf') {
      a.options = [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ];
    } else if (q.answerFormat === 'ordered') {
      const tiles = [...q.answers.map((x) => ({ id: x.id, text: x.text })), ...q.distractors.map((d, i) => ({ id: `d${i}`, text: d }))];
      let order = shuffle(this.s, tiles);
      if (order.every((t, i) => t.id === tiles[i]!.id)) order = shuffle(this.s, tiles);
      a.options = order;
    }
    return a;
  }

  // ─────────── flow ───────────

  setHolder(playerId: string, now: number) {
    this.s.holderId = playerId;
    this.s.turnStartedAt = now;
    this.s.turnIndex++;
    this.s.status = 'playing';
    this.ensureTurnMinimum(now);
  }

  /** Start a new list round. Returns false if no list questions are left. */
  startListRound(holderId: string, now: number): boolean {
    const q = this.pickListQuestion();
    if (!q) return false;
    this.s.usedQuestionIds.push(q.id);
    const round: ListRound = { kind: 'list', questionId: q.id, used: [], fires: 0, startedAt: now };
    this.s.round = round;
    if (!this.s.fuse) this.newFuse(now);
    this.setHolder(holderId, now);
    return true;
  }

  /** Hand `holderId` a new single question. Returns false if none are left. */
  startSingleTurn(holderId: string, now: number): boolean {
    let round = this.s.round?.kind === 'single' ? this.s.round : null;
    if (!round) {
      round = { kind: 'single', active: null, lapTurnsLeft: 0, lapsStarted: 0, band: { center: 1, width: 1 }, clusterQueue: [], clusterKey: null };
      this.s.round = round;
    }
    if (round.lapTurnsLeft <= 0) this.startLap(round);
    const q = this.pickSingleQuestion(round);
    if (!q) return false;
    this.s.usedQuestionIds.push(q.id);
    round.active = this.makeActive(q, now);
    round.lapTurnsLeft--;
    if (!this.s.fuse) this.newFuse(now);
    this.setHolder(holderId, now);
    return true;
  }

  /** Same single question passes to the next player. */
  carryTurn(holderId: string, now: number) {
    const round = this.s.round as SingleRound;
    const a = round.active!;
    a.progress = [];
    a.wrongTries = 0;
    a.askedAt = now;
    if (!this.s.fuse) this.newFuse(now);
    this.setHolder(holderId, now);
  }

  /** Order to try phases in when moving on. */
  phaseOrder(): ('list' | 'single')[] {
    const st = this.s.settings;
    if (st.mode === 'list') return ['list'];
    if (st.mode === 'single') return ['single'];
    const cur = this.s.phaseKind;
    if (cur === 'list') return this.s.phaseRounds >= st.mixedListRounds ? ['single', 'list'] : ['list', 'single'];
    if (cur === 'single') {
      const r = this.s.round?.kind === 'single' ? this.s.round : null;
      const lapDone = !r || r.lapTurnsLeft <= 0;
      return lapDone && r && r.lapsStarted >= st.mixedSingleLaps ? ['list', 'single'] : ['single', 'list'];
    }
    return ['list', 'single'];
  }

  /** Move on to the next question (new list round or new single question). */
  advance(holderId: string | null, now: number) {
    const holder = this.resolveHolder(holderId);
    if (!holder) return this.endGame(now, 'exhausted');
    for (const kind of this.phaseOrder()) {
      if (kind !== this.s.phaseKind) {
        this.s.phaseKind = kind;
        this.s.phaseRounds = 0;
        this.s.round = null;
      }
      const ok = kind === 'list' ? this.startListRound(holder, now) : this.startSingleTurn(holder, now);
      if (ok) return;
    }
    this.endGame(now, 'exhausted');
  }

  start(now: number) {
    if (this.s.status !== 'lobby') return;
    const first = this.s.players.find((p) => !p.removed);
    if (!first) return;
    this.s.phaseKind = null;
    this.advance(first.id, now);
  }

  // ─────────── outcomes ───────────

  addBonus(p: PlayerState, now: number) {
    const st = this.s.settings;
    if (!st.bonusLives) return;
    p.bonusProgress++;
    if (p.bonusProgress >= st.bonusEvery) {
      p.bonusProgress = 0;
      if (p.lives < st.maxLives) {
        p.lives++;
        this.feed(p.id, 'Remyelinated! +1 life', 'bonus', now);
      }
    }
  }

  buildReveal(q: Question, reason: RevealReason): Reveal {
    const used = this.s.round?.kind === 'list' ? this.s.round.used : [];
    let answers = q.answers.filter((a) => a.enabled).map((a) => ({
      text: a.text,
      gotBy: used.find((u) => u.answerId === a.id)?.playerId,
      supplemented: a.supplemented,
    }));
    if (q.answerFormat === 'tf') answers = [{ text: q.answers[0]!.text.toLowerCase() === 'true' ? 'True' : 'False', gotBy: undefined, supplemented: false }];
    return {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      format: q.answerFormat,
      answers,
      reason,
      explanation: q.explanation,
      sourceRef: q.sourceRef,
      sourceDeck: q.sourceDeck,
    };
  }

  /** Answers still unused in a list round (what the player could have said). */
  openListAnswers(q: Question, round: ListRound): string {
    return q.answers
      .filter((a) => a.enabled && !round.used.some((u) => u.answerId === a.id))
      .map((a) => a.text)
      .join(', ');
  }

  fullAnswer(q: Question): string {
    if (q.answerFormat === 'tf') return q.answers[0]!.text.toLowerCase() === 'true' ? 'True' : 'False';
    const enabled = q.answers.filter((a) => a.enabled).map((a) => a.text);
    return enabled.join(q.answerFormat === 'ordered' ? ' → ' : ', ');
  }

  showReveal(q: Question, reason: RevealReason, nextHolderId: string | null, now: number) {
    const reveal = this.buildReveal(q, reason);
    if (q.type === 'list') {
      for (const a of reveal.answers) {
        if (!a.gotBy) this.history({ at: now, questionId: q.id, prompt: q.prompt, outcome: 'revealed', answer: a.text, topic: q.topic });
      }
      this.s.phaseRounds++;
    } else if (reason !== 'answered') {
      this.history({ at: now, questionId: q.id, prompt: q.prompt, outcome: 'revealed', answer: this.fullAnswer(q), topic: q.topic });
    }
    this.s.fuse = null;
    this.s.status = 'interlude';
    this.s.interlude = {
      kind: 'reveal',
      startedAt: now,
      until: now + this.s.settings.revealMs,
      reveal,
      nextHolderId,
      resume: 'next_question',
    };
    this.fx.push({ type: 'reveal', questionId: q.id });
  }

  /** Threshold reached (or a one-try question answered wrong): holder loses a life. */
  fire(now: number, cause: 'threshold' | 'wrong_choice', given?: string) {
    const p = this.player(this.s.holderId);
    const round = this.s.round;
    if (!p || !round) return;
    p.lives = Math.max(0, p.lives - 1);
    p.fires++;
    this.fx.push({ type: 'fired', playerId: p.id });
    this.feedback(p.id, cause === 'wrong_choice' ? 'wrong_choice' : 'fired', cause === 'wrong_choice' ? `Wrong pick — ${p.name} fired` : `Action potential — ${p.name} fired`, now);
    this.feed(p.id, cause === 'wrong_choice' ? `chose "${given ?? ''}"` : 'fired', 'fired', now);

    const q = this.q(round.kind === 'list' ? round.questionId : round.active!.questionId);
    const ms = now - (round.kind === 'single' ? round.active!.askedAt : this.s.turnStartedAt);
    if (round.kind === 'single') this.fx.push({ type: 'outcome', playerId: p.id, questionId: q.id, correct: false, ms });
    this.history({
      at: now,
      questionId: q.id,
      prompt: q.prompt,
      playerId: p.id,
      outcome: cause === 'wrong_choice' ? 'wrong_choice' : 'fired',
      answer: round.kind === 'list' ? this.openListAnswers(q, round) : this.fullAnswer(q),
      given,
      topic: q.topic,
    });

    if (p.lives <= 0) {
      p.alive = false;
      p.eliminatedOrder = ++this.s.eliminations;
    }
    this.s.fuse = null;
    if (this.checkGameOver(now)) {
      // Still show the answer in the summary even though the game ended.
      if (q.type === 'single' && cause === 'threshold') {
        this.history({ at: now, questionId: q.id, prompt: q.prompt, outcome: 'revealed', answer: this.fullAnswer(q), topic: q.topic });
      }
      return;
    }

    const next = this.nextAlive(p.id);
    if (round.kind === 'list') {
      round.fires++;
      if (round.fires >= this.s.settings.listMaxFires) return this.showReveal(q, 'max_fires', next, now);
    } else {
      const a = round.active!;
      a.carry++;
      if (cause === 'wrong_choice') return this.showReveal(q, 'wrong_choice', next, now);
      if (a.carry >= this.alivePlayers().length + (p.alive ? 0 : 1) || this.s.solo) {
        return this.showReveal(q, 'carry_exhausted', next, now);
      }
    }
    this.s.status = 'interlude';
    this.s.interlude = {
      kind: 'fired',
      startedAt: now,
      until: now + this.s.settings.firedMs,
      firedPlayerId: p.id,
      nextHolderId: next,
      resume: 'same_question',
    };
  }

  checkGameOver(now: number): boolean {
    const alive = this.alivePlayers();
    if (this.s.solo) {
      if (alive.length === 0) {
        this.endGame(now, 'solo_out');
        return true;
      }
      return false;
    }
    if (alive.length <= 1) {
      this.endGame(now, 'winner');
      return true;
    }
    return false;
  }

  endGame(now: number, reason: 'winner' | 'exhausted' | 'solo_out') {
    const s = this.s;
    s.status = 'over';
    s.endedReason = reason;
    s.endedAt = now;
    s.fuse = null;
    s.interlude = null;
    const alive = this.alivePlayers();
    if (reason === 'winner') {
      if (alive.length) s.winnerIds = alive.map((p) => p.id);
      else {
        const last = Math.max(...s.players.map((p) => p.eliminatedOrder ?? 0));
        s.winnerIds = s.players.filter((p) => p.eliminatedOrder === last).map((p) => p.id);
      }
    } else if (reason === 'exhausted') {
      const contenders = alive.length ? alive : s.players.filter((p) => !p.removed);
      const best = (p: PlayerState) => p.lives * 1000 + p.correct;
      const top = Math.max(...contenders.map(best));
      s.winnerIds = contenders.filter((p) => best(p) === top).map((p) => p.id);
    } else {
      s.winnerIds = [];
    }
    this.fx.push({ type: 'gameOver', winnerIds: s.winnerIds });
  }

  resumeInterlude(now: number) {
    const il = this.s.interlude;
    if (!il) return;
    this.s.interlude = null;
    this.s.status = 'playing';
    if (il.resume === 'same_question') {
      const holder = this.resolveHolder(il.nextHolderId);
      if (!holder) return this.endGame(now, 'exhausted');
      this.newFuse(now);
      if (this.s.round?.kind === 'list') this.setHolder(holder, now);
      else this.carryTurn(holder, now);
      return;
    }
    this.advance(il.nextHolderId, now);
  }

  /** Process any deadlines that passed before `now`, at their own timestamps. */
  runTimers(now: number) {
    for (let guard = 0; guard < 100; guard++) {
      const s = this.s;
      if (s.status === 'playing' && s.fuse && now >= s.fuse.endsAt) {
        this.fire(s.fuse.endsAt, 'threshold');
      } else if (s.status === 'interlude' && s.interlude && now >= s.interlude.until) {
        this.resumeInterlude(s.interlude.until);
      } else break;
    }
  }

  // ─────────── submissions ───────────

  submit(playerId: string, sub: Submission, now: number) {
    const s = this.s;
    if (s.status !== 'playing' || s.holderId !== playerId || !s.round) return;
    const p = this.player(playerId)!;
    if (s.round.kind === 'list') return this.submitList(p, s.round, sub, now);
    return this.submitSingle(p, s.round, sub, now);
  }

  rejectMessage(r: MatchResult): string {
    switch (r.status) {
      case 'already_used':
        return `Already used: ${r.canonical}`;
      case 'ambiguous':
        return r.reason === 'multiple_answers' ? `Be more specific: ${r.candidates?.join(' or ')}?` : 'Too close to another term — check spelling';
      default:
        return r.reason === 'empty' ? 'Type an answer' : 'Not accepted';
    }
  }

  submitList(p: PlayerState, round: ListRound, sub: Submission, now: number) {
    if (sub.kind !== 'text') return;
    const q = this.q(round.questionId);
    const used = round.used.map((u) => u.answerId);
    const open = q.answers.filter((a) => a.enabled && !used.includes(a.id)).map((a) => a.id);
    const r = matchAnswer(this.ctx.index, { questionId: q.id, openAnswerIds: open, usedAnswerIds: used }, sub.text);
    if (r.status !== 'accepted') {
      const kind: FeedbackKind = r.status === 'already_used' ? 'already_used' : r.status === 'ambiguous' ? 'ambiguous' : 'wrong';
      const msg = r.status === 'wrong' && r.reason !== 'empty' ? 'Not in this list' : this.rejectMessage(r);
      this.feedback(p.id, kind, msg, now);
      if (r.reason !== 'empty') this.feed(p.id, sub.text, 'rejected', now, msg);
      return;
    }
    const answerId = r.answerId!;
    round.used.push({ answerId, playerId: p.id, at: now });
    p.correct++;
    this.feedback(p.id, 'accepted', `✓ ${r.canonical}`, now);
    this.feed(p.id, r.canonical!, 'accepted', now);
    this.fx.push({ type: 'outcome', playerId: p.id, questionId: q.id, correct: true, ms: now - this.s.turnStartedAt, answerId });
    this.history({ at: now, questionId: q.id, prompt: q.prompt, playerId: p.id, outcome: 'correct', answer: r.canonical!, given: sub.text, topic: q.topic });
    if (this.ctx.rarity(q, answerId) >= 3) this.addBonus(p, now);

    const next = this.nextAlive(p.id);
    if (open.length === 1) return this.showReveal(q, 'complete', next, now);
    if (next) this.setHolder(next, now);
  }

  submitSingle(p: PlayerState, round: SingleRound, sub: Submission, now: number) {
    const a = round.active;
    if (!a) return;
    const q = this.q(a.questionId);
    const fmt = q.answerFormat ?? 'term';

    if (fmt === 'mc' || fmt === 'tf') {
      if (sub.kind !== 'choice') return;
      const correctId = fmt === 'tf' ? q.answers[0]!.text.toLowerCase() : q.answers[0]!.id;
      const label = a.options?.find((o) => o.id === sub.optionId)?.text ?? sub.optionId;
      if (!a.options?.some((o) => o.id === sub.optionId)) return;
      if (sub.optionId === correctId) return this.singleCorrect(p, q, a, label, now);
      return this.fire(now, 'wrong_choice', label);
    }

    if (fmt === 'ordered') {
      if (sub.kind !== 'order') return;
      const expected = q.answers.filter((x) => x.enabled).map((x) => x.id);
      const ok = sub.sequence.length === expected.length && sub.sequence.every((id, i) => id === expected[i]);
      if (ok) return this.singleCorrect(p, q, a, expected.map((id) => q.answers.find((x) => x.id === id)!.text).join(' → '), now);
      a.wrongTries++;
      this.penalize(now, this.s.settings.orderPenaltyMs);
      this.feedback(p.id, 'wrong_order', 'Wrong order — try again', now);
      this.feed(p.id, 'wrong order', 'rejected', now);
      return;
    }

    // term / set: free text, possibly several parts at once
    if (sub.kind !== 'text') return;
    const enabled = q.answers.filter((x) => x.enabled);
    const tryOne = (text: string) => {
      const open = enabled.filter((x) => !a.progress.includes(x.id)).map((x) => x.id);
      const r = matchAnswer(this.ctx.index, { questionId: q.id, openAnswerIds: open, usedAnswerIds: a.progress }, text);
      if (r.status === 'accepted') a.progress.push(r.answerId!);
      return r;
    };
    let results = [tryOne(sub.text)];
    if (results[0]!.status !== 'accepted' && fmt === 'set') {
      const parts = splitParts(sub.text);
      if (parts.length > 1) results = parts.map(tryOne);
    }
    const accepted = results.filter((r) => r.status === 'accepted');
    if (a.progress.length >= enabled.length) {
      return this.singleCorrect(p, q, a, this.fullAnswer(q), now);
    }
    if (accepted.length) {
      const names = accepted.map((r) => r.canonical).join(', ');
      this.feedback(p.id, 'partial', `✓ ${names} (${a.progress.length}/${enabled.length})`, now);
      this.feed(p.id, names, 'accepted', now, `${a.progress.length}/${enabled.length}`);
      return;
    }
    const r = results[0]!;
    const kind: FeedbackKind = r.status === 'already_used' ? 'already_used' : r.status === 'ambiguous' ? 'ambiguous' : 'wrong';
    const msg = this.rejectMessage(r);
    this.feedback(p.id, kind, msg, now);
    if (r.reason !== 'empty') this.feed(p.id, sub.text, 'rejected', now, msg);
  }

  singleCorrect(p: PlayerState, q: Question, a: ActiveQuestion, shown: string, now: number) {
    p.correct++;
    this.feedback(p.id, 'accepted', `✓ ${shown}`, now);
    this.feed(p.id, shown, 'accepted', now);
    this.fx.push({ type: 'outcome', playerId: p.id, questionId: q.id, correct: true, ms: now - a.askedAt });
    this.history({ at: now, questionId: q.id, prompt: q.prompt, playerId: p.id, outcome: 'correct', answer: this.fullAnswer(q), topic: q.topic });
    if (this.ctx.difficulty(q) >= 4) this.addBonus(p, now);
    const next = this.nextAlive(p.id);
    if (a.carry > 0) {
      // A carried question was finally answered: everyone sees the answer briefly.
      return this.showReveal(q, 'answered', next, now);
    }
    this.advance(next, now);
  }

  removePlayer(playerId: string, now: number) {
    const p = this.player(playerId);
    if (!p || p.removed) return;
    const wasHolder = this.s.holderId === playerId;
    p.removed = true;
    if (p.alive) {
      p.alive = false;
    }
    if (this.s.status === 'lobby') {
      this.s.players = this.s.players.filter((x) => x.id !== playerId);
      this.s.solo = this.s.players.length === 1;
      return;
    }
    if (this.s.status === 'over') return;
    if (this.checkGameOver(now)) return;
    if (wasHolder && this.s.status === 'playing') {
      const next = this.nextAlive(playerId);
      if (!next) return this.endGame(now, 'exhausted');
      if (this.s.round?.kind === 'single' && this.s.round.active) this.carryTurn(next, now);
      else this.setHolder(next, now);
    }
  }
}

/** Potential 0..1 toward threshold (1 = fires). Rises faster near the end. */
export function potentialLevel(fuse: { segStart: number; segLevel: number; endsAt: number }, now: number): number {
  const span = fuse.endsAt - fuse.segStart;
  const x = span <= 0 ? 1 : Math.min(1, Math.max(0, (now - fuse.segStart) / span));
  // Steady climb that accelerates near threshold.
  return fuse.segLevel + (1 - fuse.segLevel) * (0.65 * x + 0.35 * x * x * x);
}

export function nextDeadline(s: GameState): number | null {
  if (s.status === 'playing' && s.fuse) return s.fuse.endsAt;
  if (s.status === 'interlude' && s.interlude) return s.interlude.until;
  return null;
}

/** Pure reducer: (state, event) → new state + effects. Never mutates the input. */
export function reduce(ctx: EngineContext, state: GameState, event: GameEvent): ReduceResult {
  const s: GameState = structuredClone(state);
  const run = new Run(ctx, s);
  if (event.type !== 'start') run.runTimers(event.now);
  switch (event.type) {
    case 'start':
      run.start(event.now);
      break;
    case 'tick':
      break;
    case 'submit':
      run.submit(event.playerId, event.submission, event.now);
      break;
    case 'continue':
      if (s.status === 'interlude') run.resumeInterlude(event.now);
      break;
    case 'removePlayer':
      run.removePlayer(event.playerId, event.now);
      break;
  }
  run.fx.push({ type: 'schedule', at: nextDeadline(s) });
  return { state: s, effects: run.fx };
}

/** Convenience wrapper bundling a context with the reducer. */
export function createEngine(questions: readonly Question[], opts: EngineOptions = {}) {
  const ctx = createContext(questions, opts);
  return {
    ctx,
    init: (players: PlayerInit[], settings?: GameSettingsInput) => initGame(players, settings),
    reduce: (state: GameState, event: GameEvent) => reduce(ctx, state, event),
  };
}

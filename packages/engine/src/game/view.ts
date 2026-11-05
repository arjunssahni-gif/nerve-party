import type { AnswerFormat, QuestionType, SourceRef } from '@nerve/shared';
import { potentialLevel, type EngineContext } from './engine';
import type { Feedback, FeedEntry, GameState, GameStatus, Option, Reveal } from './types';

export interface PlayerView {
  id: string;
  name: string;
  lives: number;
  maxLives: number;
  alive: boolean;
  removed: boolean;
  isHolder: boolean;
  bonusProgress: number;
  bonusEvery: number;
  correct: number;
}

export interface QuestionView {
  id: string;
  prompt: string;
  topic: string;
  type: QuestionType;
  format: AnswerFormat | 'list';
  /** Multiple choice / true-false: a wrong pick fires immediately. */
  oneTry: boolean;
  options?: Option[];
  /** Set questions: parts needed / given. */
  partsTotal: number;
  partsDone: string[];
  /** How many players already fired on this question. */
  carry: number;
  sourceDeck: string;
  sourceRef: SourceRef;
  cluster?: { entity: string; facet: string };
  /** List rounds: answers named so far. */
  listUsed?: { text: string; playerId: string }[];
  listTotal?: number;
  listFires?: number;
}

export interface GameView {
  status: GameStatus;
  players: PlayerView[];
  holderId: string | null;
  /** 0..1 toward threshold (quantised). */
  potential: number;
  /** Same as a membrane potential in mV, -70 → -55. */
  potentialMv: number;
  phaseKind: QuestionType | null;
  question: QuestionView | null;
  interlude: { kind: 'fired' | 'reveal'; msLeft: number; totalMs: number; reveal?: Reveal; firedPlayerId?: string } | null;
  feedback: Feedback | null;
  feed: FeedEntry[];
  winnerIds: string[];
  endedReason?: GameState['endedReason'];
  turnIndex: number;
  lap: number;
  solo: boolean;
}

export const RESTING_MV = -70;
export const THRESHOLD_MV = -55;

/**
 * Client-safe view of the game: no hidden fuse time, no unrevealed answers.
 * `quantum` rounds the potential so the exact fuse can't be reverse-engineered.
 */
export function viewGame(ctx: EngineContext, s: GameState, now: number, quantum = 0.02): GameView {
  const st = s.settings;
  const raw = s.status === 'playing' && s.fuse ? potentialLevel(s.fuse, now) : 0;
  const potential = Math.min(1, Math.round(raw / quantum) * quantum);

  let question: QuestionView | null = null;
  const round = s.round;
  if (round && s.status !== 'over') {
    const qid = round.kind === 'list' ? round.questionId : round.active?.questionId;
    const q = qid ? ctx.questions.get(qid) : undefined;
    if (q) {
      const fmt = q.type === 'list' ? 'list' : (q.answerFormat ?? 'term');
      const enabled = q.answers.filter((a) => a.enabled);
      const active = round.kind === 'single' ? round.active : null;
      question = {
        id: q.id,
        prompt: q.prompt,
        topic: q.topic,
        type: q.type,
        format: fmt,
        oneTry: fmt === 'mc' || fmt === 'tf',
        options: active?.options,
        partsTotal: fmt === 'set' ? enabled.length : 1,
        partsDone: active ? active.progress.map((id) => q.answers.find((a) => a.id === id)?.text ?? id) : [],
        carry: active?.carry ?? 0,
        sourceDeck: q.sourceDeck,
        sourceRef: q.sourceRef,
        cluster: q.cluster ? { entity: q.cluster.entity, facet: q.cluster.facet } : undefined,
      };
      if (round.kind === 'list') {
        question.listUsed = round.used.map((u) => ({ text: q.answers.find((a) => a.id === u.answerId)?.text ?? u.answerId, playerId: u.playerId }));
        question.listTotal = enabled.length;
        question.listFires = round.fires;
      }
    }
  }

  return {
    status: s.status,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      lives: p.lives,
      maxLives: Math.max(st.lives, p.lives),
      alive: p.alive,
      removed: p.removed,
      isHolder: p.id === s.holderId && s.status === 'playing',
      bonusProgress: p.bonusProgress,
      bonusEvery: st.bonusEvery,
      correct: p.correct,
    })),
    holderId: s.holderId,
    potential,
    potentialMv: RESTING_MV + (THRESHOLD_MV - RESTING_MV) * potential,
    phaseKind: s.phaseKind,
    question,
    interlude: s.interlude
      ? {
          kind: s.interlude.kind,
          msLeft: Math.max(0, s.interlude.until - now),
          totalMs: s.interlude.until - s.interlude.startedAt,
          reveal: s.interlude.reveal,
          firedPlayerId: s.interlude.firedPlayerId,
        }
      : null,
    feedback: s.feedback,
    feed: s.feed,
    winnerIds: s.winnerIds,
    endedReason: s.endedReason,
    turnIndex: s.turnIndex,
    lap: s.lapIndex,
    solo: s.solo,
  };
}

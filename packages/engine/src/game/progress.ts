import type { Question } from '@nerve/shared';
import type { GameState } from './types';

/** One player's record for one question. */
export interface QuestionProgress {
  seen: number;
  correct: number;
  /** Most recent result counts most: mastered = last attempt was correct. */
  lastCorrect: boolean;
  lastAt: number;
}

/** questionId → progress, for one player on one deck. */
export type ProgressMap = Record<string, QuestionProgress>;

/**
 * What a finished (or in-progress) game taught each player.
 * - single: correct if they answered it; seen if it was shown to them or revealed.
 * - list: correct if they named ≥1 answer without firing on it; seen by everyone in the round.
 */
export function progressFromGame(s: GameState): Record<string, Record<string, { correct: boolean; at: number }>> {
  const out: Record<string, Record<string, { correct: boolean; at: number }>> = {};
  for (const p of s.players) out[p.id] = {};
  const at = s.endedAt ?? 0;
  for (const qid of s.usedQuestionIds) {
    for (const p of s.players) out[p.id]![qid] = { correct: false, at };
  }
  const firedOn = new Set(s.history.filter((h) => h.outcome === 'fired' || h.outcome === 'wrong_choice').map((h) => `${h.playerId}|${h.questionId}`));
  for (const h of s.history) {
    if (h.outcome !== 'correct' || !h.playerId) continue;
    if (firedOn.has(`${h.playerId}|${h.questionId}`)) continue;
    out[h.playerId]![h.questionId] = { correct: true, at: h.at };
  }
  return out;
}

export function mergeProgress(prev: ProgressMap, results: Record<string, { correct: boolean; at: number }>): ProgressMap {
  const next: ProgressMap = { ...prev };
  for (const [qid, r] of Object.entries(results)) {
    const old = next[qid] ?? { seen: 0, correct: 0, lastCorrect: false, lastAt: 0 };
    next[qid] = { seen: old.seen + 1, correct: old.correct + (r.correct ? 1 : 0), lastCorrect: r.correct, lastAt: r.at };
  }
  return next;
}

export interface DeckProgress {
  total: number;
  seen: number;
  mastered: number;
  /** 0..1 for the progress rings. */
  seenRatio: number;
  masteredRatio: number;
  byTopic: Record<string, { total: number; seen: number; mastered: number }>;
}

export function deckProgress(questions: readonly Question[], progress: ProgressMap): DeckProgress {
  const byTopic: DeckProgress['byTopic'] = {};
  let seen = 0;
  let mastered = 0;
  for (const q of questions) {
    const t = (byTopic[q.topic] ??= { total: 0, seen: 0, mastered: 0 });
    t.total++;
    const pr = progress[q.id];
    if (pr && pr.seen > 0) {
      seen++;
      t.seen++;
    }
    if (pr?.lastCorrect) {
      mastered++;
      t.mastered++;
    }
  }
  const total = questions.length;
  return { total, seen, mastered, seenRatio: total ? seen / total : 0, masteredRatio: total ? mastered / total : 0, byTopic };
}

/**
 * "Continue learning" priorities for a room: questions not yet mastered by
 * the most players come first; never-seen questions get a small extra boost.
 */
export function continuePriorities(questions: readonly Question[], players: ProgressMap[]): Record<string, number> {
  const pr: Record<string, number> = {};
  for (const q of questions) {
    let notMastered = 0;
    let unseen = 0;
    for (const p of players) {
      const r = p[q.id];
      if (!r?.lastCorrect) notMastered++;
      if (!r || r.seen === 0) unseen++;
    }
    pr[q.id] = notMastered * 2 + (unseen > 0 ? 1 : 0);
  }
  return pr;
}

import type { AnswerFormat, GameSettings, QuestionType, SourceRef } from '@nerve/shared';

export interface PlayerInit {
  id: string;
  name: string;
}

export interface PlayerState {
  id: string;
  name: string;
  lives: number;
  alive: boolean;
  /** Left / kicked: never gets a turn again. */
  removed: boolean;
  /** 1 = first eliminated. */
  eliminatedOrder?: number;
  bonusProgress: number;
  correct: number;
  fires: number;
}

export type Submission =
  | { kind: 'text'; text: string }
  /** Multiple choice or true/false option id. */
  | { kind: 'choice'; optionId: string }
  /** Word-bank tiles in the chosen order. */
  | { kind: 'order'; sequence: string[] };

export type GameEvent =
  | { type: 'start'; now: number }
  | { type: 'submit'; playerId: string; submission: Submission; now: number }
  | { type: 'tick'; now: number }
  /** Host skips the current reveal / pause. */
  | { type: 'continue'; now: number }
  | { type: 'removePlayer'; playerId: string; now: number };

export interface Option {
  id: string;
  text: string;
}

export interface ActiveQuestion {
  questionId: string;
  /** Number of players who already fired on this question. */
  carry: number;
  /** Answer ids given so far this turn (set). */
  progress: string[];
  /** Shuffled options (mc / tf) or tiles (ordered). */
  options?: Option[];
  wrongTries: number;
  askedAt: number;
}

export interface ListRound {
  kind: 'list';
  questionId: string;
  used: { answerId: string; playerId: string; at: number }[];
  fires: number;
  startedAt: number;
}

export interface SingleRound {
  kind: 'single';
  active: ActiveQuestion | null;
  /** New questions left to hand out in this lap. */
  lapTurnsLeft: number;
  lapsStarted: number;
  band: { center: number; width: number };
  /** Continuous mode: remaining question ids of the current cluster, in order. */
  clusterQueue: string[];
  clusterKey: string | null;
}

export interface Fuse {
  startedAt: number;
  endsAt: number;
  /** The potential curve restarts from (segStart, segLevel) after extensions/penalties. */
  segStart: number;
  segLevel: number;
}

export type RevealReason = 'complete' | 'max_fires' | 'carry_exhausted' | 'wrong_choice' | 'answered';

export interface RevealAnswer {
  text: string;
  gotBy?: string;
  supplemented: boolean;
}

export interface Reveal {
  questionId: string;
  prompt: string;
  type: QuestionType;
  format?: AnswerFormat;
  answers: RevealAnswer[];
  reason: RevealReason;
  explanation?: string;
  sourceRef: SourceRef;
  sourceDeck: string;
}

export interface Interlude {
  kind: 'fired' | 'reveal';
  startedAt: number;
  until: number;
  firedPlayerId?: string;
  reveal?: Reveal;
  /** Who goes next when the interlude ends. */
  nextHolderId: string | null;
  /** After a "fired" pause the same question continues with the next player. */
  resume: 'same_question' | 'next_question';
}

export type FeedbackKind =
  | 'accepted'
  | 'partial'
  | 'already_used'
  | 'wrong'
  | 'ambiguous'
  | 'wrong_order'
  | 'wrong_choice'
  | 'fired';

export interface Feedback {
  seq: number;
  at: number;
  playerId: string;
  kind: FeedbackKind;
  message: string;
}

export interface FeedEntry {
  seq: number;
  at: number;
  playerId: string;
  text: string;
  result: 'accepted' | 'rejected' | 'fired' | 'bonus';
  note?: string;
}

export type HistoryOutcome = 'correct' | 'fired' | 'wrong_choice' | 'revealed';

export interface HistoryEntry {
  seq: number;
  at: number;
  questionId: string;
  prompt: string;
  /** Undefined = shown to everyone (round reveal). */
  playerId?: string;
  outcome: HistoryOutcome;
  /** The answer that should be studied (full answer for singles, one item for list reveals). */
  answer: string;
  given?: string;
  topic: string;
}

export type GameStatus = 'lobby' | 'playing' | 'interlude' | 'over';

export interface GameState {
  status: GameStatus;
  settings: GameSettings;
  rng: number;
  players: PlayerState[];
  /** Started with one player: you vs the fuse. */
  solo: boolean;
  holderId: string | null;
  turnStartedAt: number;
  turnIndex: number;
  /** Global lap counter for the rising single-question band. */
  lapIndex: number;
  fuse: Fuse | null;
  phaseKind: QuestionType | null;
  /** List rounds completed in the current list phase. */
  phaseRounds: number;
  round: ListRound | SingleRound | null;
  usedQuestionIds: string[];
  topicCursor: number;
  interlude: Interlude | null;
  feedback: Feedback | null;
  feed: FeedEntry[];
  history: HistoryEntry[];
  seq: number;
  eliminations: number;
  winnerIds: string[];
  endedReason?: 'winner' | 'exhausted' | 'solo_out';
  endedAt?: number;
}

export type Effect =
  | { type: 'schedule'; at: number | null }
  | { type: 'outcome'; playerId: string; questionId: string; correct: boolean; ms: number; answerId?: string }
  | { type: 'fired'; playerId: string }
  | { type: 'reveal'; questionId: string }
  | { type: 'gameOver'; winnerIds: string[] };

export interface ReduceResult {
  state: GameState;
  effects: Effect[];
}

export type Settings = GameSettings;

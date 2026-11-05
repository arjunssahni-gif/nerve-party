import { osaDistance, tokenTolerance } from './distance';
import type { MatchIndex, TermEntry } from './termIndex';
import { normalize, type NormalizedTerm } from './normalize';

export type MatchStatus = 'accepted' | 'already_used' | 'wrong' | 'ambiguous';

export type WrongReason = 'empty' | 'not_in_list' | 'confusable';

export interface MatchResult {
  status: MatchStatus;
  /** Matched answer (accepted / already_used). */
  answerId?: string;
  canonical?: string;
  /** For wrong/ambiguous: why, for the "not accepted" message. */
  reason?: WrongReason | 'too_close' | 'multiple_answers';
  /** For ambiguous: the competing terms. */
  candidates?: string[];
  /** 0 = exact, larger = looser. */
  cost?: number;
  /** True when accepted via a typo correction (not exact/alias). */
  fuzzy?: boolean;
}

export interface MatchContext {
  questionId: string;
  /** Answers that would be accepted now (enabled, not used). */
  openAnswerIds: readonly string[];
  /** Answers already used (this round / this turn). */
  usedAnswerIds: readonly string[];
}

/** Two costs within this margin are a tie. */
const EPS = 0.02;
/** Cost added when the player omitted (or added) a class word like "nerve". */
const GENERIC_COST = 0.1;
/** Base cost for any typo-corrected match. */
const FUZZY_BASE = 0.2;

type Role = 'answer' | 'used' | 'confusable' | 'other';

interface Candidate {
  entry: TermEntry;
  role: Role;
  cost: number;
}

/**
 * Edit distance between one input token and one bank token, or null if they
 * shouldn't be considered the same word. A typo only counts if the input isn't
 * itself a different real word and isn't at least as close to another real word.
 */
function tokenEdits(t: string, u: string, index: MatchIndex): number | null {
  if (t === u) return 0;
  const tol = tokenTolerance(u.length);
  if (tol === 0 || Math.abs(t.length - u.length) > tol) return null;
  const d = osaDistance(t, u, tol);
  if (d > tol) return null;
  if (index.vocab.has(t)) return null;
  for (let len = t.length - d; len <= t.length + d; len++) {
    const words = index.vocabByLength.get(len);
    if (!words) continue;
    for (const w of words) {
      if (w !== u && osaDistance(t, w, d) <= d) return null;
    }
  }
  return d;
}

/** Total edits to align input tokens with term tokens, or null. */
function alignTokens(input: string[], term: string[], index: MatchIndex): { edits: number; length: number } | null {
  const length = term.reduce((n, t) => n + t.length, 0);
  if (input.length === term.length) {
    let edits = 0;
    for (let i = 0; i < term.length; i++) {
      const e = tokenEdits(input[i]!, term[i]!, index);
      if (e === null) return null;
      edits += e;
    }
    return { edits, length };
  }
  // Different token counts: only tolerate spacing differences (+ at most one typo on long terms).
  const a = input.join('');
  const b = term.join('');
  if (a === b) return { edits: 0, length };
  if (b.length >= 10 && osaDistance(a, b, 1) <= 1) return { edits: 1, length };
  return null;
}

function costFrom(aligned: { edits: number; length: number } | null, base: number): number | null {
  if (!aligned) return null;
  if (aligned.edits === 0) return base;
  return base + FUZZY_BASE + aligned.edits / Math.max(1, aligned.length);
}

/**
 * Class words are compatible if the input's are a subset of the term's
 * (all names of the answer count), or the term never uses one.
 */
function genericsCompatible(input: NormalizedTerm, classWords: readonly string[]): boolean {
  if (classWords.length === 0) return true;
  return input.generics.every((g) => classWords.includes(g));
}

export function termCost(
  input: NormalizedTerm,
  term: NormalizedTerm,
  index: MatchIndex,
  classWords: readonly string[] = term.generics,
): number | null {
  let best = costFrom(alignTokens(input.tokens, term.tokens, index), 0);
  if (best === 0) return 0;
  const sameShape = input.core.length === input.tokens.length && term.core.length === term.tokens.length;
  if (!sameShape && genericsCompatible(input, classWords)) {
    const c = costFrom(alignTokens(input.core, term.core, index), GENERIC_COST);
    if (c !== null && (best === null || c < best)) best = c;
  }
  return best;
}

function roleOf(entry: TermEntry, ctx: MatchContext): Role {
  if (entry.questionId !== ctx.questionId) return 'other';
  if (entry.kind === 'confusable') return 'confusable';
  if (entry.answerId && ctx.usedAnswerIds.includes(entry.answerId)) return 'used';
  if (entry.answerId && ctx.openAnswerIds.includes(entry.answerId)) return 'answer';
  return 'other'; // disabled answer: a known term, but not accepted
}

function bestOf(cands: Candidate[], role: Role): Candidate | undefined {
  let best: Candidate | undefined;
  for (const c of cands) if (c.role === role && (!best || c.cost < best.cost)) best = c;
  return best;
}

const isLoose = (cost: number) => cost >= FUZZY_BASE; // a typo was corrected

/** Best 'other' candidate that isn't simply another spelling of the given answer. */
function rivalOf(cands: Candidate[], index: MatchIndex, ctx: MatchContext, answerId: string | undefined): Candidate | undefined {
  const ownKeys = new Set(
    (index.byQuestion.get(ctx.questionId) ?? []).filter((e) => e.answerId === answerId).map((e) => e.key),
  );
  let rival: Candidate | undefined;
  for (const c of cands) {
    if (c.role !== 'other' || ownKeys.has(c.entry.key)) continue;
    if (!rival || c.cost < rival.cost) rival = c;
  }
  return rival;
}

/**
 * Check a typed answer against the open answers of a question.
 * Every term in the bank is considered, so a near-miss for a *different* term
 * (a confusable, an answer from another question, an already-used answer)
 * is rejected rather than fuzzily accepted.
 */
export function matchAnswer(index: MatchIndex, ctx: MatchContext, rawInput: string): MatchResult {
  const input = normalize(rawInput);
  if (!input.key) return { status: 'wrong', reason: 'empty' };

  const cands: Candidate[] = [];
  for (const entry of index.entries) {
    const cost = termCost(input, entry.norm, index, entry.classWords);
    if (cost === null) continue;
    cands.push({ entry, role: roleOf(entry, ctx), cost });
  }

  const ans = bestOf(cands, 'answer');
  const used = bestOf(cands, 'used');
  const conf = bestOf(cands, 'confusable');
  const other = bestOf(cands, 'other');

  if (!ans) {
    if (used) {
      const blockedByConf = conf && conf.cost <= used.cost + EPS;
      const rival = rivalOf(cands, index, ctx, used.entry.answerId);
      const blockedByOther = isLoose(used.cost) && rival && rival.cost <= used.cost + EPS;
      if (!blockedByConf && !blockedByOther) {
        return { status: 'already_used', answerId: used.entry.answerId, canonical: used.entry.canonical, cost: used.cost };
      }
    }
    if (conf && (!other || conf.cost <= other.cost + EPS)) return { status: 'wrong', reason: 'confusable', candidates: [conf.entry.display] };
    return { status: 'wrong', reason: 'not_in_list' };
  }

  const a = ans.cost;
  if (conf && conf.cost <= a + EPS) {
    return { status: 'wrong', reason: 'confusable', candidates: [conf.entry.display] };
  }
  if (used && used.cost < a - EPS) {
    return { status: 'already_used', answerId: used.entry.answerId, canonical: used.entry.canonical, cost: used.cost };
  }

  // Several different answers equally close → ambiguous.
  const tied = new Map<string, string>();
  for (const c of cands) {
    if ((c.role === 'answer' || c.role === 'used') && c.cost <= a + EPS && c.entry.answerId) {
      tied.set(c.entry.answerId, c.entry.canonical ?? c.entry.display);
    }
  }
  if (tied.size > 1) {
    return { status: 'ambiguous', reason: 'multiple_answers', candidates: [...tied.values()] };
  }

  // A typo-corrected match must not be as close to some other known term
  // (terms spelled the same as this answer, e.g. it appearing in another question, don't count).
  if (isLoose(a)) {
    const rival = rivalOf(cands, index, ctx, ans.entry.answerId);
    if (rival && rival.cost <= a + EPS) {
      if (rival.cost < a - EPS) return { status: 'wrong', reason: 'not_in_list' };
      return { status: 'ambiguous', reason: 'too_close', candidates: [ans.entry.canonical ?? ans.entry.display, rival.entry.display] };
    }
  }

  return {
    status: 'accepted',
    answerId: ans.entry.answerId,
    canonical: ans.entry.canonical,
    cost: a,
    fuzzy: isLoose(a),
  };
}

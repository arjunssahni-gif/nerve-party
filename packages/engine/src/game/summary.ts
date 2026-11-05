import type { GameState, HistoryEntry } from './types';

export interface StudyItem {
  questionId: string;
  prompt: string;
  answer: string;
  topic: string;
  /** fired = time ran out on you; wrong_choice = wrong one-try pick; revealed = nobody got it. */
  reason: 'fired' | 'wrong_choice' | 'revealed';
  given?: string;
}

export interface PlayerSummary {
  playerId: string;
  name: string;
  rank: number;
  winner: boolean;
  lives: number;
  correct: number;
  fires: number;
  missed: StudyItem[];
  got: { prompt: string; answer: string }[];
}

function studyItem(h: HistoryEntry): StudyItem {
  return {
    questionId: h.questionId,
    prompt: h.prompt,
    answer: h.answer,
    topic: h.topic,
    reason: h.outcome === 'revealed' ? 'revealed' : h.outcome === 'wrong_choice' ? 'wrong_choice' : 'fired',
    given: h.given,
  };
}

/** Per-player study summary: what they missed (or nobody got), and what they got. */
export function buildSummary(s: GameState): PlayerSummary[] {
  const ranked = [...s.players].sort((a, b) => {
    const w = Number(s.winnerIds.includes(b.id)) - Number(s.winnerIds.includes(a.id));
    if (w) return w;
    const ea = a.eliminatedOrder ?? Infinity;
    const eb = b.eliminatedOrder ?? Infinity;
    if (ea !== eb) return eb - ea;
    return b.lives - a.lives || b.correct - a.correct;
  });

  return ranked.map((p, i) => {
    const missed: StudyItem[] = [];
    const seen = new Set<string>();
    for (const h of s.history) {
      const mine = h.playerId === p.id && (h.outcome === 'fired' || h.outcome === 'wrong_choice');
      const everyone = h.playerId === undefined && h.outcome === 'revealed';
      if (!mine && !everyone) continue;
      if (!h.answer) continue;
      const key = `${h.questionId}|${h.answer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      missed.push(studyItem(h));
    }
    const got = s.history
      .filter((h) => h.playerId === p.id && h.outcome === 'correct')
      .map((h) => ({ prompt: h.prompt, answer: h.answer }));
    return {
      playerId: p.id,
      name: p.name,
      rank: i + 1,
      winner: s.winnerIds.includes(p.id),
      lives: p.lives,
      correct: p.correct,
      fires: p.fires,
      missed,
      got,
    };
  });
}

/** Group study items by question (list reveals produce one item per missed answer). */
export function groupStudyItems(items: StudyItem[]): { prompt: string; topic: string; answers: string[]; reasons: StudyItem['reason'][] }[] {
  const out = new Map<string, { prompt: string; topic: string; answers: string[]; reasons: StudyItem['reason'][] }>();
  for (const it of items) {
    let g = out.get(it.questionId);
    if (!g) out.set(it.questionId, (g = { prompt: it.prompt, topic: it.topic, answers: [], reasons: [] }));
    for (const a of it.answer.split(/,\s*/)) if (a && !g.answers.includes(a)) g.answers.push(a);
    if (!g.reasons.includes(it.reason)) g.reasons.push(it.reason);
  }
  return [...out.values()];
}

export function summaryToMarkdown(p: PlayerSummary, title = 'Nerve Party — study list'): string {
  const lines = [`# ${title}`, '', `**${p.name}** — rank ${p.rank}, ${p.correct} correct, fired ${p.fires}×`, ''];
  const groups = groupStudyItems(p.missed);
  if (!groups.length) lines.push('Nothing missed. 🎉');
  let topic = '';
  for (const g of groups) {
    if (g.topic !== topic) {
      topic = g.topic;
      lines.push(`## ${topic}`, '');
    }
    lines.push(`- **${g.prompt}**`, `  - ${g.answers.join('; ')}`);
  }
  return lines.join('\n') + '\n';
}

export function summaryToCsv(p: PlayerSummary): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [['topic', 'question', 'answer', 'reason', 'your answer'].join(',')];
  for (const m of p.missed) rows.push([m.topic, m.prompt, m.answer, m.reason, m.given ?? ''].map(esc).join(','));
  return rows.join('\n') + '\n';
}

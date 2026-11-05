/**
 * Try the answer checker against the sample deck.
 *   npm run matcher -- l-median-muscles "flexor digitorum sublimis"
 *   npm run matcher -- --list
 */
import { sampleDeck } from '@nerve/shared';
import { buildMatchIndex, matchAnswer } from '@nerve/engine';

const [qid, ...rest] = process.argv.slice(2);
const typed = sampleDeck.questions.filter((q) => q.type === 'list' || q.answerFormat === 'term' || q.answerFormat === 'set');

if (!qid || qid === '--list') {
  console.log('Question ids you can test against:\n');
  for (const q of typed) console.log(`  ${q.id.padEnd(22)} ${q.prompt}`);
  console.log('\nUsage: npm run matcher -- <question-id> "<your answer>" ["<another answer>" ...]');
  process.exit(0);
}

const q = typed.find((x) => x.id === qid);
if (!q) {
  console.error(`Unknown question "${qid}". Run: npm run matcher -- --list`);
  process.exit(1);
}
const index = buildMatchIndex(sampleDeck.questions);
const used: string[] = [];
console.log(`Q: ${q.prompt}\n`);
for (const input of rest) {
  const open = q.answers.filter((a) => a.enabled && !used.includes(a.id)).map((a) => a.id);
  const r = matchAnswer(index, { questionId: q.id, openAnswerIds: open, usedAnswerIds: used }, input);
  if (r.status === 'accepted') used.push(r.answerId!);
  const extra = r.canonical ? ` → ${r.canonical}${r.fuzzy ? ' (typo corrected)' : ''}` : r.reason ? ` (${r.reason}${r.candidates ? ': ' + r.candidates.join(' / ') : ''})` : '';
  console.log(`  "${input}": ${r.status.toUpperCase()}${extra}`);
}

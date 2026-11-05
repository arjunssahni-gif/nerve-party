import type { Question } from '@nerve/shared';
import { normalize, normalizeToken, type NormalizedTerm } from './normalize';

/**
 * Real anatomical words that differ from each other by only a letter or two.
 * They are always part of the vocabulary, so a typo-tolerant match can never
 * turn one into another (abductor ≠ adductor, major ≠ minor, ...), even if the
 * bank doesn't happen to contain both.
 */
export const BUILTIN_VOCABULARY: readonly string[] = [
  'abductor', 'adductor', 'major', 'minor', 'magnus', 'minimus', 'maximus', 'medius', 'longus', 'longissimus',
  'brevis', 'medial', 'lateral', 'median', 'medius', 'superior', 'inferior', 'anterior', 'posterior', 'internal',
  'external', 'internus', 'externus', 'superficial', 'superficialis', 'profundus', 'deep', 'ulnar', 'ulnaris', 'radial',
  'radialis', 'flexor', 'extensor', 'pronator', 'supinator', 'proximal', 'distal', 'dorsal', 'palmar', 'plantar',
  'ascending', 'descending', 'afferent', 'efferent', 'sympathetic', 'parasympathetic', 'iliohypogastric', 'ilioinguinal',
  'iliolumbar', 'genitofemoral', 'suprascapular', 'subscapular', 'supraspinatus', 'infraspinatus', 'supraspinous',
  'infraspinous', 'transversus', 'transversalis', 'transverse', 'teres', 'pectoralis', 'pectineus', 'pectineal', 'hallucis',
  'pollicis', 'indicis', 'digitorum', 'digiti', 'interossei', 'interosseous', 'humeral', 'humerus', 'radius', 'ulna',
  'tibial', 'fibular', 'peroneal', 'femoral', 'obturator', 'gluteal', 'gluteus', 'superficialis', 'carpi', 'carpal',
  'metacarpal', 'metatarsal', 'tarsal', 'cervical', 'thoracic', 'lumbar', 'sacral', 'coccygeal', 'cranial', 'caudal',
  'epigastric', 'hypogastric', 'thoracodorsal', 'thoracoabdominal', 'intercostal', 'subcostal', 'costal', 'oblique',
  'tubercle', 'tuberosity', 'trochanter', 'trochlea', 'capitulum', 'condyle', 'epicondyle', 'greater', 'lesser',
  'upper', 'lower', 'middle', 'ilium', 'ileum', 'malleus', 'malleolus', 'hypoglossal', 'glossopharyngeal', 'vagus',
  'vagal', 'facial', 'fascial', 'palatine', 'palatal', 'mental', 'parietal', 'visceral', 'cephalic',
  'basilic', 'brachial', 'brachialis', 'brachii', 'brachiocephalic', 'axillary', 'arcuate',
  'coracoid', 'coronoid', 'condylar', 'scaphoid', 'lunate', 'triquetrum', 'pisiform', 'trapezium', 'trapezoid',
  'capitate', 'hamate', 'trapezius', 'retinaculum', 'extensor', 'aponeurosis', 'apophysis', 'pyramidalis', 'piriformis',
];

export type TermKind = 'answer' | 'confusable';

export interface TermEntry {
  key: string;
  norm: NormalizedTerm;
  questionId: string;
  /** Set for kind === 'answer'. */
  answerId?: string;
  kind: TermKind;
  /** Original text (for messages). */
  display: string;
  /** Canonical answer text (for answers). */
  canonical?: string;
  /** Class words (nerve, artery...) used by any name of this answer, e.g. {nerve} for "median"/"median nerve". */
  classWords: string[];
}

export interface MatchIndex {
  entries: TermEntry[];
  /** Entries for each question, for quick role lookup. */
  byQuestion: Map<string, TermEntry[]>;
  /** All known normalized tokens, bucketed by length for fast scanning. */
  vocab: Set<string>;
  vocabByLength: Map<number, string[]>;
}

/** Formats whose answers are matched against typed text. */
function isTyped(q: Question): boolean {
  return q.type === 'list' || q.answerFormat === 'term' || q.answerFormat === 'set';
}

export function buildMatchIndex(questions: readonly Question[], extraTerms: readonly string[] = []): MatchIndex {
  const entries: TermEntry[] = [];
  const byQuestion = new Map<string, TermEntry[]>();
  const vocab = new Set<string>();

  const add = (e: TermEntry) => {
    if (!e.key) return;
    entries.push(e);
    let arr = byQuestion.get(e.questionId);
    if (!arr) byQuestion.set(e.questionId, (arr = []));
    arr.push(e);
  };
  const addVocab = (n: NormalizedTerm) => n.tokens.forEach((t) => vocab.add(t));

  for (const q of questions) {
    const typed = isTyped(q);
    for (const a of q.answers) {
      const seen = new Set<string>();
      const names = [a.text, ...a.aliases].map((text) => ({ text, norm: normalize(text) }));
      const classWords = [...new Set(names.flatMap((n) => n.norm.generics))];
      for (const { text, norm } of names) {
        addVocab(norm);
        if (!typed || seen.has(norm.key)) continue;
        seen.add(norm.key);
        add({ key: norm.key, norm, questionId: q.id, answerId: a.id, kind: 'answer', display: text, canonical: a.text, classWords });
      }
    }
    const seenConf = new Set<string>();
    for (const text of [...q.confusables, ...q.distractors]) {
      const norm = normalize(text);
      addVocab(norm);
      if (!typed || seenConf.has(norm.key) || !q.confusables.includes(text)) continue;
      seenConf.add(norm.key);
      add({ key: norm.key, norm, questionId: q.id, kind: 'confusable', display: text, classWords: norm.generics });
    }
  }
  for (const text of extraTerms) addVocab(normalize(text));
  for (const w of BUILTIN_VOCABULARY) vocab.add(normalizeToken(w));

  const vocabByLength = new Map<number, string[]>();
  for (const w of vocab) {
    let arr = vocabByLength.get(w.length);
    if (!arr) vocabByLength.set(w.length, (arr = []));
    arr.push(w);
  }
  return { entries, byQuestion, vocab, vocabByLength };
}

import { describe, expect, it } from 'vitest';
import { QuestionSchema, sampleDeck, type Question, type QuestionInput } from '@nerve/shared';
import { buildMatchIndex, matchAnswer, normalize, osaDistance, splitParts, type MatchIndex } from '../src/matcher';

const bank = sampleDeck.questions;
const sampleIndex = buildMatchIndex(bank);
const byId = new Map(bank.map((q) => [q.id, q]));

function check(questionId: string, input: string, used: string[] = [], index: MatchIndex = sampleIndex, questions = byId) {
  const q = questions.get(questionId);
  if (!q) throw new Error(`no question ${questionId}`);
  const open = q.answers.filter((a) => a.enabled && !used.includes(a.id)).map((a) => a.id);
  return matchAnswer(index, { questionId, openAnswerIds: open, usedAnswerIds: used }, input);
}

function expectAccepted(qid: string, input: string, answerId: string, used: string[] = []) {
  const r = check(qid, input, used);
  expect(r, `"${input}" should be accepted as ${answerId}`).toMatchObject({ status: 'accepted', answerId });
}

function expectNotAccepted(qid: string, input: string, used: string[] = []) {
  const r = check(qid, input, used);
  expect(r.status, `"${input}" must NOT be accepted (got ${JSON.stringify(r)})`).not.toBe('accepted');
  return r;
}

/** Build a tiny custom bank for edge cases. */
function customBank(inputs: QuestionInput[]) {
  const qs: Question[] = inputs.map((q) => QuestionSchema.parse(q));
  return { index: buildMatchIndex(qs), map: new Map(qs.map((q) => [q.id, q])) };
}

const ans = (id: string, text: string, aliases: string[] = [], extra: Record<string, unknown> = {}) => ({ id, text, aliases, ...extra });

// ───────────────────────────────────────────────────────────────
describe('osaDistance', () => {
  it('computes edits including adjacent transpositions', () => {
    expect(osaDistance('median', 'median')).toBe(0);
    expect(osaDistance('median', 'medain')).toBe(1); // transposition
    expect(osaDistance('ulnar', 'ulner')).toBe(1);
    expect(osaDistance('major', 'minor')).toBe(2);
    expect(osaDistance('', 'abc')).toBe(3);
  });
  it('exits early above the cutoff', () => {
    expect(osaDistance('superficialis', 'profundus', 2)).toBeGreaterThan(2);
  });
});

describe('normalize', () => {
  it('lowercases, trims, strips punctuation and diacritics', () => {
    expect(normalize('  Flexor  Digitörum, Superficialis!! ').key).toBe('flexor digitorum superficialis');
  });
  it('expands m./n./a./v./lig. and drops "the"', () => {
    expect(normalize('the median n.').key).toBe('median nerve');
    expect(normalize('Pronator teres m.').key).toBe(normalize('pronator teres muscle').key);
    expect(normalize('radial a.').key).toBe('radial artery');
    expect(normalize('inguinal lig.').key).toBe('inguinal ligament');
  });
  it('treats plurals and singulars the same', () => {
    expect(normalize('lumbricals').key).toBe(normalize('lumbrical').key);
    expect(normalize('dorsal interossei').key).toBe(normalize('dorsal interosseous').key);
    expect(normalize('nerves').key).toBe(normalize('nerve').key);
    expect(normalize('arteries').key).toBe(normalize('artery').key);
    expect(normalize('branches').key).toBe(normalize('branch').key);
    expect(normalize('vertebrae').key).toBe(normalize('vertebra').key);
  });
  it('maps British spellings to American', () => {
    expect(normalize('oesophagus').key).toBe(normalize('esophagus').key);
    expect(normalize('haemorrhage').key).toBe(normalize('hemorrhage').key);
    expect(normalize('fibres').key).toBe(normalize('fibers').key);
    expect(normalize('coeliac trunk').key).toBe(normalize('celiac trunk').key);
  });
  it('handles eponym apostrophes and ordinals', () => {
    expect(normalize("Erb's point").key).toBe(normalize('Erbs point').key);
    expect(normalize('Poupart’s ligament').key).toBe(normalize("poupart's ligament").key);
    expect(normalize('first and second lumbricals').key).toBe(normalize('1st and 2nd lumbricals').key);
    expect(normalize('lumbricals 1 and 2').key).toBe(normalize('lumbricals 1-2').key);
  });
  it('separates generic class words from the core', () => {
    const n = normalize('Median nerve');
    expect(n.core).toEqual(['median']);
    expect(n.generics).toEqual(['nerve']);
  });
});

describe('splitParts', () => {
  it('splits on commas, semicolons, arrows and "and"', () => {
    expect(splitParts('C5, C6')).toEqual(['C5', 'C6']);
    expect(splitParts('C8 and T1')).toEqual(['C8', 'T1']);
    expect(splitParts('skin -> fascia; muscle')).toEqual(['skin', 'fascia', 'muscle']);
  });
});

// ───────────────────────────────────────────────────────────────
describe('matcher: exact, alias, abbreviation', () => {
  const Q = 'l-median-muscles';
  it('accepts canonical names in any case/spacing', () => {
    expectAccepted(Q, 'Flexor digitorum superficialis', 'flexor-digitorum-superficialis');
    expectAccepted(Q, '  flexor   DIGITORUM superficialis ', 'flexor-digitorum-superficialis');
  });
  it('accepts abbreviations exactly', () => {
    expectAccepted(Q, 'FDS', 'flexor-digitorum-superficialis');
    expectAccepted(Q, 'fds', 'flexor-digitorum-superficialis');
    expectAccepted(Q, 'FPL', 'flexor-pollicis-longus');
    expectAccepted(Q, 'APB', 'abductor-pollicis-brevis');
    expectAccepted(Q, 'FCR', 'flexor-carpi-radialis');
    expectAccepted(Q, 'PQ', 'pronator-quadratus');
  });
  it('never fuzzes abbreviations', () => {
    expectNotAccepted(Q, 'FDP '.replace('P', 'X')); // FDX
    expectNotAccepted(Q, 'APL'); // abductor pollicis longus is radial
    expectNotAccepted(Q, 'FCU');
    expectNotAccepted(Q, 'AP');
  });
  it('accepts old names / alternate names', () => {
    expectAccepted(Q, 'flexor digitorum sublimis', 'flexor-digitorum-superficialis');
    expectAccepted('l-posterior-cord', 'middle subscapular nerve', 'thoracodorsal-nerve');
    expectAccepted('l-posterior-cord', 'nerve to latissimus dorsi', 'thoracodorsal-nerve');
    expectAccepted('l-medial-cord', 'medial antebrachial cutaneous nerve', 'medial-cutaneous-nerve-of-forearm');
    expectAccepted('l-radial-muscles', 'extensor digitorum communis', 'extensor-digitorum');
    expectAccepted('l-radial-muscles', 'EDC', 'extensor-digitorum');
  });
  it('accepts eponyms', () => {
    expectAccepted('s-eo-ligament', "Poupart's ligament", 'inguinal-ligament');
    expectAccepted('s-eo-ligament', 'pouparts ligament', 'inguinal-ligament');
    expectAccepted('s-eo-ligament', 'Poupart’s lig.', 'inguinal-ligament');
    expectAccepted('s-winged', 'nerve of Bell', 'long-thoracic-nerve');
  });
  it('accepts with or without the class word (muscle, nerve, artery)', () => {
    expectAccepted('s-carpal-nerve', 'median', 'median-nerve');
    expectAccepted('s-carpal-nerve', 'median nerve', 'median-nerve');
    expectAccepted('s-carpal-nerve', 'the median n.', 'median-nerve');
    expectAccepted('l-posterior-cord', 'thoracodorsal', 'thoracodorsal-nerve');
    expectAccepted('l-posterior-cord', 'radial', 'radial-nerve');
    expectAccepted(Q, 'pronator teres muscle', 'pronator-teres');
    expectAccepted(Q, 'pronator teres m.', 'pronator-teres');
    expectAccepted('s-ss-nerve', 'suprascapular', 'suprascapular-nerve');
  });
  it('rejects the right word with the wrong class word', () => {
    expectNotAccepted('s-carpal-nerve', 'median artery');
    expectNotAccepted('l-posterior-cord', 'radial artery');
    expectNotAccepted('s-snuffbox', 'radial nerve');
  });
  it('handles plurals and Latin plurals', () => {
    expectAccepted('l-ulnar-muscles', 'palmar interossei', 'palmar-interossei');
    expectAccepted('l-ulnar-muscles', 'palmar interosseous', 'palmar-interossei');
    expectAccepted('l-ulnar-muscles', 'palmar interosseous muscles', 'palmar-interossei');
    expectAccepted('l-ulnar-muscles', 'dorsal interosseus', 'dorsal-interossei');
    expectAccepted('l-abdominal-muscles', 'external obliques', 'external-oblique');
    expectAccepted('l-radial-muscles', 'tricep', 'triceps-brachii');
    expectAccepted('l-radial-muscles', 'triceps', 'triceps-brachii');
    expectAccepted('l-msk-muscles', 'bicep', 'biceps-brachii');
    expectAccepted('l-carpal-tunnel', 'FDP tendon', 'flexor-digitorum-profundus-tendons');
  });
  it('handles numbered structures and spinal levels', () => {
    expectAccepted(Q, 'lumbricals 1 and 2', 'lumbricals-1-and-2');
    expectAccepted(Q, '1st and 2nd lumbricals', 'lumbricals-1-and-2');
    expectAccepted(Q, 'first & second lumbricals', 'lumbricals-1-and-2');
    expectAccepted('l-ulnar-muscles', 'lumbricals 3 & 4', 'lumbricals-3-and-4');
    expectAccepted('l-abdominal-nerves', 'T12', 'subcostal-nerve-t12');
    expectAccepted('l-abdominal-nerves', 'T7-T11', 'thoracoabdominal-nerves-t7-t11');
    expectAccepted('l-abdominal-nerves', 'T7–T11', 'thoracoabdominal-nerves-t7-t11');
    expectAccepted('s-erb', 'C 5', 'c5');
  });
});

describe('matcher: typos', () => {
  it('accepts single typos in long words', () => {
    expectAccepted('l-median-muscles', 'flexr digitorum superficialis', 'flexor-digitorum-superficialis');
    expectAccepted('l-median-muscles', 'flexor digitorum superficalis', 'flexor-digitorum-superficialis');
    expectAccepted('l-median-muscles', 'flexor digitroum superficialis', 'flexor-digitorum-superficialis');
    expectAccepted('l-median-muscles', 'opponens policis', 'opponens-pollicis');
    expectAccepted('l-median-muscles', 'pronator quadratis', 'pronator-quadratus');
    expectAccepted('l-ulnar-muscles', 'flexor digitorum profundis', 'flexor-digitorum-profundus-medial-half');
    expectAccepted('l-radial-muscles', 'extensor pollicus longus', 'extensor-pollicis-longus');
    expectAccepted('l-radial-muscles', 'brachioradilis', 'brachioradialis');
    expectAccepted('l-abdominal-muscles', 'internal obliqe', 'internal-oblique');
    expectAccepted('l-abdominal-muscles', 'transversus abdominus', 'transversus-abdominis');
    expectAccepted('l-abdominal-muscles', 'rectus abdominus', 'rectus-abdominis');
    expectAccepted('l-abdominal-nerves', 'iliohypogastic', 'iliohypogastric-nerve-l1');
    expectAccepted('s-surgical-neck', 'axilary nerve', 'axillary-nerve');
    expectAccepted('s-winged', 'long thorasic nerve', 'long-thoracic-nerve');
    expectAccepted('s-carpal-nerve', 'meidan nerve', 'median-nerve');
    expectAccepted('s-roof-carpal', 'flexor retinaculm', 'flexor-retinaculum');
    expectAccepted('s-deep-ring', 'transversalis fasica', 'transversalis-fascia');
    // "facia" is one edit from both "fascia" and "facial" → too close to call
    expectNotAccepted('s-deep-ring', 'transversalis facia');
  });
  it('tolerates a missing space in long terms', () => {
    expectAccepted('l-median-muscles', 'flexordigitorum superficialis', 'flexor-digitorum-superficialis');
    expectAccepted('l-abdominal-muscles', 'transversusabdominis', 'transversus-abdominis');
  });
  it('rejects heavy misspellings', () => {
    expectNotAccepted('l-median-muscles', 'flxr dgtrm sprfcls');
    expectNotAccepted('s-carpal-nerve', 'mdn');
  });
  it('marks typo-corrected matches as fuzzy', () => {
    expect(check('s-carpal-nerve', 'meidan nerve').fuzzy).toBe(true);
    expect(check('s-carpal-nerve', 'median nerve').fuzzy).toBe(false);
  });
});

describe('matcher: confusable near-misses are never accepted', () => {
  it('FDP never matches FDS (and vice versa)', () => {
    const { index, map } = customBank([
      {
        id: 'fds-only',
        topic: 't',
        sourceDeck: 'd',
        type: 'list',
        prompt: 'Name a muscle supplied only by the median nerve in the anterior forearm.',
        answers: [ans('fds', 'Flexor digitorum superficialis', ['FDS', 'flexor digitorum sublimis']), ans('pt', 'Pronator teres')],
        confusables: ['Flexor digitorum profundus', 'FDP'],
        difficulty: 3,
      },
    ]);
    const c = (s: string) => check('fds-only', s, [], index, map);
    for (const s of ['flexor digitorum profundus', 'flexor digitorum profundis', 'Flexor digitorum profondus', 'FDP', 'fdp', 'flexor digitorum superficial', 'flexor digitorum']) {
      expect(c(s).status, s).not.toBe('accepted');
    }
    expect(c('flexor digitorum profundus')).toMatchObject({ status: 'wrong', reason: 'confusable' });
    expect(c('flexor digitorum superficialis').status).toBe('accepted');
  });

  it('blocks near-misses even when they are NOT listed as confusables (global vocabulary)', () => {
    const { index, map } = customBank([
      {
        id: 'q',
        topic: 't',
        sourceDeck: 'd',
        type: 'list',
        prompt: 'Name a muscle.',
        answers: [ans('tmaj', 'Teres major'), ans('abd', 'Abductor digiti minimi'), ans('ecrl', 'Extensor carpi radialis longus'), ans('mp', 'Medial pectoral nerve')],
        difficulty: 2,
      },
    ]);
    const c = (s: string) => check('q', s, [], index, map);
    expect(c('teres minor').status).not.toBe('accepted');
    expect(c('adductor digiti minimi').status).not.toBe('accepted');
    expect(c('extensor carpi radialis brevis').status).not.toBe('accepted');
    expect(c('extensor carpi ulnaris longus').status).not.toBe('accepted');
    expect(c('lateral pectoral nerve').status).not.toBe('accepted');
    expect(c('flexor carpi radialis longus').status).not.toBe('accepted');
    // sanity: the real ones still work
    expect(c('teres major').status).toBe('accepted');
    expect(c('abductor digiti minimi').status).toBe('accepted');
  });

  it('median vs ulnar lists: classic traps', () => {
    for (const s of [
      'flexor carpi ulnaris',
      'FCU',
      'adductor pollicis',
      'abductor pollicis longus',
      'APL',
      'lumbricals 3 and 4',
      'medial lumbricals',
      'medial FDP',
      'flexor digitorum profundus medial half',
      'abductor digiti minimi',
      'brachioradialis',
      'supinator',
      'palmar interossei',
      'adductor pollicis brevis',
      'extensor carpi radialis',
      'flexor pollicis brevis deep head',
    ]) {
      expectNotAccepted('l-median-muscles', s);
    }
    for (const s of [
      'flexor digitorum superficialis',
      'FDS',
      'abductor pollicis brevis',
      'APB',
      'abductor pollicis',
      'opponens pollicis',
      'lumbricals 1 and 2',
      'lateral lumbricals',
      'lateral FDP',
      'flexor carpi radialis',
      'adductor digiti minimi',
    ]) {
      expectNotAccepted('l-ulnar-muscles', s);
    }
  });

  it('a typo exactly between two real words is rejected', () => {
    // "adbuctor" is 1 edit from both abductor and adductor
    expectNotAccepted('l-median-muscles', 'adbuctor pollicis brevis');
  });

  it('typos that land closer to a confusable are rejected', () => {
    expect(check('l-axillary-muscles', 'teres majr').status).not.toBe('accepted');
    expect(check('l-axillary-muscles', 'teres minr')).toMatchObject({ status: 'accepted', answerId: 'teres-minor' });
    expect(check('l-axillary-muscles', 'teres major')).toMatchObject({ status: 'wrong', reason: 'confusable' });
  });

  it('supra- vs subscapular, transversus vs transversalis, ilio- nerves', () => {
    expectNotAccepted('s-ss-nerve', 'subscapular nerve');
    expectNotAccepted('s-ss-nerve', 'subscapular');
    expectAccepted('s-ss-nerve', 'suprascapula nerve', 'suprascapular-nerve');
    expectNotAccepted('s-deep-ring', 'transversus abdominis');
    expectNotAccepted('s-deep-ring', 'transversus');
    expectNotAccepted('l-abdominal-nerves', 'genitofemoral nerve');
    expectNotAccepted('l-abdominal-nerves', 'genitofemoral');
    expectAccepted('l-abdominal-nerves', 'ilioinguinal', 'ilioinguinal-nerve-l1');
    expectAccepted('l-abdominal-nerves', 'iliohypogastric', 'iliohypogastric-nerve-l1');
    expectNotAccepted('s-ss-insertion', 'lesser tubercle');
    expectNotAccepted('s-roof-carpal', 'extensor retinaculum');
    expectNotAccepted('s-eo-ligament', 'lacunar ligament');
    expectNotAccepted('s-winged', 'thoracodorsal nerve');
    expectNotAccepted('l-rotator-cuff', 'teres major');
    expectNotAccepted('l-msk-muscles', 'brachioradialis');
    expectNotAccepted('l-radial-muscles', 'brachialis');
    expectNotAccepted('l-radial-muscles', 'biceps brachii');
    expectNotAccepted('l-radial-muscles', 'APB');
    expectNotAccepted('l-carpal-tunnel', 'ulnar nerve');
    expectNotAccepted('l-carpal-tunnel', 'palmaris longus');
  });

  it('does not accept answers that belong to a different question', () => {
    const r = check('l-median-muscles', 'palmaris brevis'); // ulnar list answer
    expect(r).toMatchObject({ status: 'wrong', reason: 'not_in_list' });
    expectNotAccepted('l-axillary-muscles', 'supraspinatus');
    expectNotAccepted('l-msk-muscles', 'triceps brachii');
  });

  it('partial-innervation answers are separate answers', () => {
    expectAccepted('l-median-muscles', 'FDP', 'flexor-digitorum-profundus-lateral-half');
    expectAccepted('l-median-muscles', 'lateral half of FDP', 'flexor-digitorum-profundus-lateral-half');
    expectAccepted('l-ulnar-muscles', 'FDP', 'flexor-digitorum-profundus-medial-half');
    expectAccepted('l-ulnar-muscles', 'FDP to ring and little fingers', 'flexor-digitorum-profundus-medial-half');
    expectAccepted('l-ulnar-muscles', 'flexor pollicis brevis deep head', 'flexor-pollicis-brevis-deep-head');
    expectAccepted('l-median-muscles', 'FPB', 'flexor-pollicis-brevis-superficial-head');
  });
});

describe('matcher: already used', () => {
  const Q = 'l-median-muscles';
  it('reports an already-used answer by any of its names', () => {
    const used = ['flexor-digitorum-superficialis'];
    expect(check(Q, 'FDS', used)).toMatchObject({ status: 'already_used', answerId: 'flexor-digitorum-superficialis' });
    expect(check(Q, 'flexor digitorum sublimis', used).status).toBe('already_used');
    expect(check(Q, 'flexor digitorum superficalis', used).status).toBe('already_used');
  });
  it('other answers still work after some are used', () => {
    expectAccepted(Q, 'pronator teres', 'pronator-teres', ['flexor-digitorum-superficialis']);
  });
  it('already-used does not leak into wrong answers', () => {
    expect(check(Q, 'flexor carpi ulnaris', ['flexor-carpi-radialis']).status).toBe('wrong');
  });
});

describe('matcher: ambiguity and disabled answers', () => {
  it('reports ambiguity when two answers are equally close', () => {
    const { index, map } = customBank([
      {
        id: 'q',
        topic: 't',
        sourceDeck: 'd',
        type: 'list',
        prompt: 'Name a structure passing through the greater sciatic foramen above piriformis.',
        answers: [ans('sgn', 'Superior gluteal nerve'), ans('sga', 'Superior gluteal artery')],
        difficulty: 3,
      },
    ]);
    const r = check('q', 'superior gluteal', [], index, map);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toHaveLength(2);
    expect(check('q', 'superior gluteal nerve', [], index, map)).toMatchObject({ status: 'accepted', answerId: 'sgn' });
    // once one is used the bare form is unambiguous? No: still ambiguous between used and open.
    expect(check('q', 'superior gluteal a.', [], index, map)).toMatchObject({ status: 'accepted', answerId: 'sga' });
  });
  it('disabled (switched-off supplemented) answers are not accepted', () => {
    const { index, map } = customBank([
      {
        id: 'q',
        topic: 't',
        sourceDeck: 'd',
        type: 'list',
        prompt: 'Name a muscle innervated by the axillary nerve.',
        answers: [ans('d', 'Deltoid'), ans('tm', 'Teres minor', [], { supplemented: true, enabled: false })],
        difficulty: 1,
      },
    ]);
    expect(check('q', 'teres minor', [], index, map)).toMatchObject({ status: 'wrong', reason: 'not_in_list' });
    expect(check('q', 'deltoid', [], index, map).status).toBe('accepted');
  });
  it('empty input', () => {
    expect(check('s-carpal-nerve', '   ')).toMatchObject({ status: 'wrong', reason: 'empty' });
    expect(check('s-carpal-nerve', '!!!')).toMatchObject({ status: 'wrong', reason: 'empty' });
  });
});

describe('matcher: set answers (multi-part)', () => {
  it('matches parts against remaining parts', () => {
    expectAccepted('s-erb', 'C5', 'c5');
    expectAccepted('s-erb', 'c6', 'c6', ['c5']);
    expect(check('s-erb', 'C5', ['c5']).status).toBe('already_used');
    expectNotAccepted('s-erb', 'C7');
    expectNotAccepted('s-klumpke', 'C5');
    expectAccepted('s-ra-blood', 'superior epigastric', 'superior-epigastric-artery');
    expectAccepted('s-ra-blood', 'inferior epigastric a.', 'inferior-epigastric-artery');
    expectNotAccepted('s-ra-blood', 'superficial epigastric artery');
    expectAccepted('s-inguinal-attach', 'ASIS', 'anterior-superior-iliac-spine');
    expectNotAccepted('s-inguinal-attach', 'AIIS');
    expectNotAccepted('s-inguinal-attach', 'pubic crest');
  });
});

describe('matcher: whole sample deck self-consistency', () => {
  const typed = bank.filter((q) => q.type === 'list' || q.answerFormat === 'term' || q.answerFormat === 'set');
  it.each(typed.map((q) => [q.id, q] as const))('%s: every answer name is accepted; every confusable rejected', (_id, q) => {
    for (const a of q.answers) {
      for (const text of [a.text, ...a.aliases]) {
        // An alias shared by two answers of the same question is legitimately ambiguous.
        const shared = q.answers.some((o) => o.id !== a.id && [o.text, ...o.aliases].some((t) => normalize(t).key === normalize(text).key));
        const r = check(q.id, text);
        if (shared) expect(r.status).toBe('ambiguous');
        else expect(r, `${q.id}: "${text}"`).toMatchObject({ status: 'accepted', answerId: a.id });
      }
    }
    for (const c of q.confusables) {
      expect(check(q.id, c).status, `${q.id}: confusable "${c}"`).not.toBe('accepted');
    }
  });
});

describe('matcher: performance', () => {
  it('checks an answer in well under 10ms on the sample bank', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) check('l-median-muscles', 'flexor digitorum superficalis');
    const per = (performance.now() - start) / 100;
    expect(per).toBeLessThan(10);
  });
});

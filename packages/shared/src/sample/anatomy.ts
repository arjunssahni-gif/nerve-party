import { DeckSchema, type Deck, type QuestionInput } from '../schemas';

/**
 * Hand-written sample deck: upper limb innervation + anterior abdominal wall.
 * Lets the game run without the Claude API. Content follows standard references
 * (Moore's Clinically Oriented Anatomy).
 */

type AnswerSpec =
  | string
  | { t: string; aka?: string[]; sup?: boolean; obs?: 1 | 2 | 3 };

const DECK = 'Sample: Upper limb & abdominal wall';
const UL = 'Upper limb innervation';
const AW = 'Abdominal wall';
const SAMPLE_REF = { snippet: 'Hand-written sample deck' };

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function answers(specs: AnswerSpec[]) {
  return specs.map((s) => {
    const spec = typeof s === 'string' ? { t: s } : s;
    return {
      id: slug(spec.t),
      text: spec.t,
      aliases: spec.aka ?? [],
      supplemented: spec.sup ?? false,
      obscurity: spec.obs ?? 1,
    };
  });
}

function list(
  id: string,
  topic: string,
  prompt: string,
  ans: AnswerSpec[],
  confusables: string[],
  difficulty: number,
  difficultyReason: string,
): QuestionInput {
  return {
    id,
    topic,
    sourceDeck: DECK,
    sourceRef: SAMPLE_REF,
    type: 'list',
    prompt,
    answers: answers(ans),
    confusables,
    difficulty,
    difficultyReason,
  };
}

interface SingleOpts {
  confusables?: string[];
  distractors?: string[];
  difficulty: number;
  reason: string;
  cluster?: { id: string; entity: string; facet: string; order: number };
  explanation?: string;
}

function single(
  id: string,
  topic: string,
  answerFormat: 'term' | 'set' | 'ordered' | 'mc' | 'tf',
  prompt: string,
  ans: AnswerSpec[],
  o: SingleOpts,
): QuestionInput {
  return {
    id,
    topic,
    sourceDeck: DECK,
    sourceRef: SAMPLE_REF,
    type: 'single',
    answerFormat,
    prompt,
    answers: answers(ans),
    confusables: o.confusables ?? [],
    distractors: o.distractors ?? [],
    difficulty: o.difficulty,
    difficultyReason: o.reason,
    cluster: o.cluster,
    explanation: o.explanation,
  };
}

// Shared alias sets
const FDS = { t: 'Flexor digitorum superficialis', aka: ['FDS', 'flexor digitorum sublimis'] };
const FPL = { t: 'Flexor pollicis longus', aka: ['FPL'] };
const FDP_LAT = {
  t: 'Flexor digitorum profundus (lateral half)',
  aka: ['FDP', 'flexor digitorum profundus', 'lateral FDP', 'FDP lateral half', 'lateral half of FDP', 'FDP to index and middle fingers'],
};
const FDP_MED = {
  t: 'Flexor digitorum profundus (medial half)',
  aka: ['FDP', 'flexor digitorum profundus', 'medial FDP', 'FDP medial half', 'medial half of FDP', 'FDP to ring and little fingers'],
};

const questions: QuestionInput[] = [
  // ───────────────────────── LIST QUESTIONS ─────────────────────────
  list(
    'l-median-muscles',
    UL,
    'Name a muscle innervated (wholly or partly) by the median nerve or its branches.',
    [
      { t: 'Pronator teres', aka: ['PT'] },
      { t: 'Flexor carpi radialis', aka: ['FCR'] },
      { t: 'Palmaris longus', aka: ['PL'] },
      FDS,
      { ...FDP_LAT, obs: 2 },
      { ...FPL, obs: 2 },
      { t: 'Pronator quadratus', aka: ['PQ'], obs: 2 },
      { t: 'Abductor pollicis brevis', aka: ['APB'] },
      { t: 'Flexor pollicis brevis (superficial head)', aka: ['FPB', 'flexor pollicis brevis', 'superficial head of FPB'], obs: 2 },
      { t: 'Opponens pollicis', aka: ['OP'] },
      { t: 'Lumbricals 1 and 2', aka: ['lateral lumbricals', 'first and second lumbricals', '1st and 2nd lumbricals', 'lumbricals 1-2'], obs: 3 },
    ],
    [
      'Flexor carpi ulnaris', 'FCU', 'Flexor digitorum profundus (medial half)', 'medial FDP', 'Adductor pollicis',
      'Abductor pollicis longus', 'APL', 'Lumbricals 3 and 4', 'medial lumbricals', 'Palmar interossei', 'Dorsal interossei',
      'Abductor digiti minimi', 'Opponens digiti minimi', 'Brachioradialis', 'Supinator', 'Flexor pollicis brevis (deep head)',
    ],
    3,
    'Long list; partial innervations (FDP, FPB, lumbricals) are classic traps.',
  ),
  list(
    'l-ulnar-muscles',
    UL,
    'Name a muscle innervated (wholly or partly) by the ulnar nerve.',
    [
      { t: 'Flexor carpi ulnaris', aka: ['FCU'] },
      { ...FDP_MED, obs: 2 },
      { t: 'Palmaris brevis', obs: 3 },
      { t: 'Abductor digiti minimi', aka: ['ADM', 'abductor digiti minimi manus'] },
      { t: 'Flexor digiti minimi brevis', aka: ['FDMB', 'flexor digiti minimi'], obs: 2 },
      { t: 'Opponens digiti minimi', aka: ['ODM'], obs: 2 },
      { t: 'Lumbricals 3 and 4', aka: ['medial lumbricals', 'third and fourth lumbricals', '3rd and 4th lumbricals', 'lumbricals 3-4'], obs: 2 },
      { t: 'Palmar interossei', aka: ['palmar interosseous muscles', 'PAD'] },
      { t: 'Dorsal interossei', aka: ['dorsal interosseous muscles', 'DAB'] },
      { t: 'Adductor pollicis' },
      { t: 'Flexor pollicis brevis (deep head)', aka: ['deep head of FPB', 'deep head of flexor pollicis brevis'], obs: 3 },
    ],
    [
      'Flexor digitorum superficialis', 'FDS', 'Flexor carpi radialis', 'FCR', 'Abductor pollicis brevis', 'APB',
      'Opponens pollicis', 'Lumbricals 1 and 2', 'lateral lumbricals', 'Flexor digitorum profundus (lateral half)', 'lateral FDP',
      'Pronator teres', 'Abductor pollicis longus', 'Flexor pollicis brevis (superficial head)',
    ],
    3,
    'Many intrinsic hand muscles; ab/adductor and lateral/medial traps.',
  ),
  list(
    'l-radial-muscles',
    UL,
    'Name a muscle innervated by the radial nerve or its deep branch / posterior interosseous nerve.',
    [
      { t: 'Triceps brachii', aka: ['triceps'] },
      { t: 'Anconeus', obs: 2 },
      { t: 'Brachioradialis' },
      { t: 'Extensor carpi radialis longus', aka: ['ECRL'] },
      { t: 'Extensor carpi radialis brevis', aka: ['ECRB'] },
      { t: 'Supinator' },
      { t: 'Extensor digitorum', aka: ['ED', 'extensor digitorum communis', 'EDC'] },
      { t: 'Extensor digiti minimi', aka: ['EDM'], obs: 2 },
      { t: 'Extensor carpi ulnaris', aka: ['ECU'] },
      { t: 'Abductor pollicis longus', aka: ['APL'] },
      { t: 'Extensor pollicis brevis', aka: ['EPB'] },
      { t: 'Extensor pollicis longus', aka: ['EPL'] },
      { t: 'Extensor indicis', aka: ['EI', 'extensor indicis proprius', 'EIP'], obs: 2 },
    ],
    ['Brachialis', 'Biceps brachii', 'Flexor carpi radialis', 'Abductor pollicis brevis', 'APB', 'Adductor pollicis', 'Pronator teres', 'Flexor carpi ulnaris'],
    2,
    'Posterior compartment muscles, familiar to most students.',
  ),
  list(
    'l-msk-muscles',
    UL,
    'Name a muscle innervated by the musculocutaneous nerve.',
    [{ t: 'Coracobrachialis' }, { t: 'Biceps brachii', aka: ['biceps'] }, { t: 'Brachialis' }],
    ['Triceps brachii', 'Brachioradialis', 'Deltoid', 'Pronator teres'],
    1,
    'Short, well-known list (anterior arm).',
  ),
  list(
    'l-axillary-muscles',
    UL,
    'Name a muscle innervated by the axillary nerve.',
    [{ t: 'Deltoid' }, { t: 'Teres minor' }],
    ['Teres major', 'Supraspinatus', 'Infraspinatus', 'Subscapularis', 'Latissimus dorsi'],
    1,
    'Two items; teres major/minor is the trap.',
  ),
  list(
    'l-posterior-cord',
    UL,
    'Name a branch of the posterior cord of the brachial plexus.',
    [
      { t: 'Upper subscapular nerve', aka: ['superior subscapular nerve'] },
      { t: 'Thoracodorsal nerve', aka: ['middle subscapular nerve', 'nerve to latissimus dorsi'] },
      { t: 'Lower subscapular nerve', aka: ['inferior subscapular nerve'] },
      { t: 'Axillary nerve', aka: ['circumflex nerve'] },
      { t: 'Radial nerve' },
    ],
    ['Lateral pectoral nerve', 'Medial pectoral nerve', 'Musculocutaneous nerve', 'Median nerve', 'Ulnar nerve', 'Long thoracic nerve', 'Suprascapular nerve', 'Dorsal scapular nerve'],
    2,
    'ULTRA mnemonic; subscapular nerves are easy to forget.',
  ),
  list(
    'l-medial-cord',
    UL,
    'Name a branch of the medial cord of the brachial plexus.',
    [
      { t: 'Medial pectoral nerve' },
      { t: 'Medial cutaneous nerve of arm', aka: ['medial brachial cutaneous nerve', 'medial cutaneous nerve of the arm'], obs: 2 },
      { t: 'Medial cutaneous nerve of forearm', aka: ['medial antebrachial cutaneous nerve', 'medial cutaneous nerve of the forearm'], obs: 2 },
      { t: 'Ulnar nerve' },
      { t: 'Medial root of median nerve', aka: ['median nerve', 'medial root of the median nerve'] },
    ],
    ['Lateral pectoral nerve', 'Musculocutaneous nerve', 'Axillary nerve', 'Radial nerve', 'Lateral root of median nerve', 'Thoracodorsal nerve'],
    3,
    'Cutaneous branches are commonly missed.',
  ),
  list(
    'l-rotator-cuff',
    UL,
    'Name a rotator cuff muscle.',
    [{ t: 'Supraspinatus' }, { t: 'Infraspinatus' }, { t: 'Teres minor' }, { t: 'Subscapularis' }],
    ['Teres major', 'Deltoid', 'Latissimus dorsi', 'Coracobrachialis'],
    1,
    'SITS — very commonly known.',
  ),
  list(
    'l-carpal-tunnel',
    UL,
    'Name a structure that passes through the carpal tunnel.',
    [
      { t: 'Median nerve' },
      { t: 'Flexor digitorum superficialis tendons', aka: ['FDS', 'FDS tendons', 'flexor digitorum superficialis'] },
      { t: 'Flexor digitorum profundus tendons', aka: ['FDP', 'FDP tendons', 'flexor digitorum profundus'] },
      { t: 'Flexor pollicis longus tendon', aka: ['FPL', 'FPL tendon', 'flexor pollicis longus'], obs: 2 },
    ],
    ['Ulnar nerve', 'Ulnar artery', 'Palmaris longus tendon', 'Palmaris longus', 'Flexor carpi radialis tendon', 'Radial artery'],
    2,
    'Ulnar nerve (Guyon canal) and palmaris longus are the traps.',
  ),
  list(
    'l-abdominal-muscles',
    AW,
    'Name a muscle of the anterolateral abdominal wall.',
    [
      { t: 'External oblique', aka: ['external abdominal oblique', 'obliquus externus abdominis'] },
      { t: 'Internal oblique', aka: ['internal abdominal oblique', 'obliquus internus abdominis'] },
      { t: 'Transversus abdominis', aka: ['transverse abdominis', 'transversus abdominus'] },
      { t: 'Rectus abdominis', aka: ['rectus abdominus'] },
      { t: 'Pyramidalis', obs: 3 },
    ],
    ['Quadratus lumborum', 'Psoas major', 'Iliacus', 'Latissimus dorsi', 'Cremaster'],
    1,
    'Core list; pyramidalis is the rare one.',
  ),
  list(
    'l-abdominal-nerves',
    AW,
    'Name a nerve that supplies the anterolateral abdominal wall.',
    [
      { t: 'Thoracoabdominal nerves (T7–T11)', aka: ['thoracoabdominal nerves', 'T7-T11', 'intercostal nerves T7-T11', 'lower intercostal nerves', 'thoracoabdominal'] },
      { t: 'Subcostal nerve (T12)', aka: ['subcostal nerve', 'T12', 'subcostal'] },
      { t: 'Iliohypogastric nerve (L1)', aka: ['iliohypogastric nerve', 'iliohypogastric'] },
      { t: 'Ilioinguinal nerve (L1)', aka: ['ilioinguinal nerve', 'ilioinguinal'], obs: 2 },
    ],
    ['Genitofemoral nerve', 'Lateral femoral cutaneous nerve', 'Femoral nerve', 'Obturator nerve', 'Phrenic nerve'],
    2,
    'Iliohypogastric vs ilioinguinal vs genitofemoral is the classic confusion.',
  ),

  // ───────────────────────── SINGLE QUESTIONS ─────────────────────────
  // Cluster: rectus abdominis (continuous mode)
  single('s-ra-origin', AW, 'set', 'Origin of rectus abdominis? (2 parts)', [{ t: 'Pubic symphysis' }, { t: 'Pubic crest' }], {
    confusables: ['Pubic tubercle', 'Iliac crest', 'Inguinal ligament'],
    difficulty: 2,
    reason: 'Standard attachment, two parts.',
    cluster: { id: 'c-rectus', entity: 'Rectus abdominis', facet: 'origin', order: 0 },
  }),
  single(
    's-ra-insertion',
    AW,
    'set',
    'Insertion of rectus abdominis? (2 parts)',
    [{ t: 'Xiphoid process', aka: ['xiphoid'] }, { t: 'Costal cartilages 5–7', aka: ['5th-7th costal cartilages', 'costal cartilages of ribs 5-7', 'costal cartilages 5 to 7'] }],
    {
      confusables: ['Costal cartilages 7-10', 'Ribs 5-12', 'Linea alba'],
      difficulty: 3,
      reason: 'Specific rib numbers needed.',
      cluster: { id: 'c-rectus', entity: 'Rectus abdominis', facet: 'insertion', order: 1 },
    },
  ),
  single(
    's-ra-innervation',
    AW,
    'mc',
    'Rectus abdominis is innervated by…',
    [{ t: 'Thoracoabdominal (T7–T11) and subcostal (T12) nerves' }],
    {
      distractors: ['Iliohypogastric and ilioinguinal nerves (L1)', 'Genitofemoral nerve (L1–L2)', 'Phrenic nerve (C3–C5)'],
      difficulty: 2,
      reason: 'Segmental supply of the anterior wall.',
      cluster: { id: 'c-rectus', entity: 'Rectus abdominis', facet: 'innervation', order: 2 },
    },
  ),
  single(
    's-ra-blood',
    AW,
    'set',
    'Main arterial supply of rectus abdominis? (2 arteries)',
    [{ t: 'Superior epigastric artery', aka: ['superior epigastric'] }, { t: 'Inferior epigastric artery', aka: ['inferior epigastric'] }],
    {
      confusables: ['Superficial epigastric artery', 'Musculophrenic artery', 'Deep circumflex iliac artery'],
      difficulty: 2,
      reason: 'Classic anastomosis.',
      cluster: { id: 'c-rectus', entity: 'Rectus abdominis', facet: 'blood supply', order: 3 },
    },
  ),
  single('s-ra-action', AW, 'tf', 'True or false: rectus abdominis flexes the trunk (lumbar vertebral column).', [{ t: 'true' }], {
    difficulty: 1,
    reason: 'Basic action.',
    cluster: { id: 'c-rectus', entity: 'Rectus abdominis', facet: 'action', order: 4 },
  }),

  // Cluster: external oblique
  single('s-eo-origin', AW, 'mc', 'Origin of the external oblique?', [{ t: 'External surfaces of ribs 5–12' }], {
    distractors: ['Thoracolumbar fascia and anterior iliac crest', 'Internal surfaces of costal cartilages 7–12', 'Pubic crest and pubic symphysis'],
    difficulty: 3,
    reason: 'Easily mixed up with internal oblique / transversus origins.',
    cluster: { id: 'c-eo', entity: 'External oblique', facet: 'origin', order: 0 },
  }),
  single(
    's-eo-ligament',
    AW,
    'term',
    'Which ligament is formed by the thickened inferior free edge of the external oblique aponeurosis?',
    [{ t: 'Inguinal ligament', aka: ["Poupart's ligament", 'inguinal'] }],
    {
      confusables: ['Lacunar ligament', 'Pectineal ligament', "Cooper's ligament", 'Iliopubic tract', 'Reflected inguinal ligament'],
      difficulty: 2,
      reason: 'Core concept.',
      cluster: { id: 'c-eo', entity: 'External oblique', facet: 'aponeurosis', order: 1 },
    },
  ),
  single('s-eo-fibres', AW, 'tf', 'True or false: external oblique fibres run inferomedially ("hands in pockets").', [{ t: 'true' }], {
    difficulty: 1,
    reason: 'Common mnemonic.',
    cluster: { id: 'c-eo', entity: 'External oblique', facet: 'fibre direction', order: 2 },
  }),
  single('s-eo-ring', AW, 'term', 'The superficial inguinal ring is an opening in which structure?', [{ t: 'External oblique aponeurosis', aka: ['aponeurosis of external oblique', 'external oblique'] }], {
    confusables: ['Internal oblique', 'Transversalis fascia', 'Transversus abdominis', 'Internal oblique aponeurosis'],
    difficulty: 2,
    reason: 'Paired with the deep ring.',
    cluster: { id: 'c-eo', entity: 'External oblique', facet: 'superficial ring', order: 3 },
  }),

  // Cluster: supraspinatus
  single('s-ss-origin', UL, 'term', 'Origin of supraspinatus?', [{ t: 'Supraspinous fossa', aka: ['supraspinous fossa of the scapula', 'supraspinatus fossa'] }], {
    confusables: ['Infraspinous fossa', 'Subscapular fossa'],
    difficulty: 1,
    reason: 'Named after its origin.',
    cluster: { id: 'c-ss', entity: 'Supraspinatus', facet: 'origin', order: 0 },
  }),
  single('s-ss-insertion', UL, 'term', 'Insertion of supraspinatus?', [{ t: 'Greater tubercle of humerus (superior facet)', aka: ['greater tubercle', 'greater tuberosity', 'superior facet of greater tubercle', 'greater tubercle of humerus'] }], {
    confusables: ['Lesser tubercle', 'Lesser tuberosity', 'Deltoid tuberosity', 'Intertubercular sulcus'],
    difficulty: 2,
    reason: 'Greater vs lesser tubercle.',
    cluster: { id: 'c-ss', entity: 'Supraspinatus', facet: 'insertion', order: 1 },
  }),
  single('s-ss-nerve', UL, 'term', 'Nerve supply of supraspinatus?', [{ t: 'Suprascapular nerve', aka: ['suprascapular'] }], {
    confusables: ['Subscapular nerve', 'Upper subscapular nerve', 'Lower subscapular nerve', 'Axillary nerve', 'Dorsal scapular nerve'],
    difficulty: 2,
    reason: 'Supra- vs subscapular trap.',
    cluster: { id: 'c-ss', entity: 'Supraspinatus', facet: 'innervation', order: 2 },
  }),
  single('s-ss-action', UL, 'mc', 'Main action of supraspinatus?', [{ t: 'Initiates abduction of the arm (first ~15°)' }], {
    distractors: ['Medial rotation of the arm', 'Lateral rotation of the arm', 'Abduction from 15° to 90°'],
    difficulty: 2,
    reason: 'Deltoid vs supraspinatus.',
    cluster: { id: 'c-ss', entity: 'Supraspinatus', facet: 'action', order: 3 },
  }),

  // Stand-alone single questions
  single('s-carpal-nerve', UL, 'term', 'What nerve passes through the carpal tunnel?', [{ t: 'Median nerve', aka: ['median'] }], {
    confusables: ['Ulnar nerve', 'Radial nerve', 'Anterior interosseous nerve', 'Palmar cutaneous branch of median nerve'],
    difficulty: 1,
    reason: 'Very commonly known.',
  }),
  single('s-surgical-neck', UL, 'term', 'Which nerve is most at risk in a fracture of the surgical neck of the humerus?', [{ t: 'Axillary nerve', aka: ['axillary', 'circumflex nerve'] }], {
    confusables: ['Radial nerve', 'Musculocutaneous nerve', 'Ulnar nerve', 'Suprascapular nerve'],
    difficulty: 2,
    reason: 'Classic clinical correlate.',
  }),
  single('s-midshaft', UL, 'term', 'Which nerve is most at risk in a midshaft fracture of the humerus (radial groove)?', [{ t: 'Radial nerve', aka: ['radial'] }], {
    confusables: ['Axillary nerve', 'Ulnar nerve', 'Median nerve'],
    difficulty: 2,
    reason: 'Classic clinical correlate.',
  }),
  single('s-winged', UL, 'term', 'Injury to which nerve causes a winged scapula?', [{ t: 'Long thoracic nerve', aka: ['long thoracic', 'nerve of Bell', 'nerve to serratus anterior'] }], {
    confusables: ['Thoracodorsal nerve', 'Dorsal scapular nerve', 'Suprascapular nerve', 'Accessory nerve'],
    difficulty: 2,
    reason: 'Classic clinical correlate.',
  }),
  single('s-erb', UL, 'set', "Which spinal roots are injured in Erb's (Erb–Duchenne) palsy? (2 roots)", [{ t: 'C5' }, { t: 'C6' }], {
    confusables: ['C7', 'C8', 'T1', 'C4'],
    difficulty: 2,
    reason: 'Upper trunk injury.',
  }),
  single('s-klumpke', UL, 'set', "Which spinal roots are injured in Klumpke's palsy? (2 roots)", [{ t: 'C8' }, { t: 'T1' }], {
    confusables: ['C5', 'C6', 'C7', 'T2'],
    difficulty: 2,
    reason: 'Lower trunk injury.',
  }),
  single('s-hamate', UL, 'term', 'A fracture of the hook of the hamate most commonly injures which nerve?', [{ t: 'Ulnar nerve', aka: ['ulnar', 'deep branch of ulnar nerve'] }], {
    confusables: ['Median nerve', 'Radial nerve', 'Recurrent branch of median nerve'],
    difficulty: 3,
    reason: 'Requires knowing Guyon canal relations.',
  }),
  single('s-roof-carpal', UL, 'term', 'What forms the roof of the carpal tunnel?', [{ t: 'Flexor retinaculum', aka: ['transverse carpal ligament'] }], {
    confusables: ['Extensor retinaculum', 'Palmar aponeurosis', 'Pisohamate ligament'],
    difficulty: 2,
    reason: 'Basic but frequently mixed with extensor retinaculum.',
  }),
  single('s-snuffbox', UL, 'term', 'Which artery is found in the floor of the anatomical snuffbox?', [{ t: 'Radial artery', aka: ['radial'] }], {
    confusables: ['Ulnar artery', 'Princeps pollicis artery', 'Anterior interosseous artery'],
    difficulty: 2,
    reason: 'Classic relation.',
  }),
  single(
    's-plexus-order',
    UL,
    'ordered',
    'Put the parts of the brachial plexus in order, proximal → distal.',
    [{ t: 'Roots' }, { t: 'Trunks' }, { t: 'Divisions' }, { t: 'Cords' }, { t: 'Branches' }],
    { difficulty: 1, reason: 'Mnemonic-level.' },
  ),
  single(
    's-cubital-order',
    UL,
    'ordered',
    'Order the main contents of the cubital fossa from lateral → medial.',
    [{ t: 'Biceps tendon' }, { t: 'Brachial artery' }, { t: 'Median nerve' }],
    { distractors: ['Ulnar nerve'], difficulty: 3, reason: 'Order plus a distractor that is not in the fossa.' },
  ),
  single(
    's-wall-layers',
    AW,
    'ordered',
    'Order the layers of the anterolateral abdominal wall (lateral to rectus) from superficial → deep.',
    [
      { t: 'Skin' },
      { t: "Camper's fascia" },
      { t: "Scarpa's fascia" },
      { t: 'External oblique' },
      { t: 'Internal oblique' },
      { t: 'Transversus abdominis' },
      { t: 'Transversalis fascia' },
      { t: 'Extraperitoneal fat' },
      { t: 'Parietal peritoneum' },
    ],
    { difficulty: 4, reason: 'Nine layers, fascial layers easily swapped.' },
  ),
  single('s-arcuate', AW, 'tf', 'True or false: below the arcuate line, the posterior layer of the rectus sheath is absent.', [{ t: 'true' }], {
    difficulty: 3,
    reason: 'Key rectus sheath concept.',
    explanation: 'Below the arcuate line all three aponeuroses pass anterior to rectus; rectus lies on transversalis fascia.',
  }),
  single('s-arcuate-level', AW, 'mc', 'The arcuate line lies approximately…', [{ t: 'One-third of the way from the umbilicus to the pubic crest' }], {
    distractors: ['At the level of the umbilicus', 'Midway between xiphoid and umbilicus', 'At the level of the anterior superior iliac spine'],
    difficulty: 4,
    reason: 'Specific landmark detail.',
  }),
  single('s-deep-ring', AW, 'term', 'The deep inguinal ring is an opening in which layer?', [{ t: 'Transversalis fascia', aka: ['transversalis'] }], {
    confusables: ['Transversus abdominis', 'External oblique aponeurosis', 'Internal oblique', 'Parietal peritoneum'],
    difficulty: 3,
    reason: 'Transversalis vs transversus trap.',
  }),
  single('s-direct-hernia', AW, 'tf', 'True or false: direct inguinal hernias pass lateral to the inferior epigastric vessels.', [{ t: 'false' }], {
    difficulty: 3,
    reason: 'MDs don\'t LIe: Medial Direct, Lateral Indirect.',
    explanation: 'Direct hernias are medial to the inferior epigastric vessels (through Hesselbach\'s triangle).',
  }),
  single('s-hesselbach', AW, 'mc', "What forms the lateral border of Hesselbach's (inguinal) triangle?", [{ t: 'Inferior epigastric vessels' }], {
    distractors: ['Lateral border of rectus abdominis', 'Inguinal ligament', 'Superficial epigastric vessels'],
    difficulty: 3,
    reason: 'Borders are commonly confused.',
  }),
  single('s-inguinal-attach', AW, 'set', 'The inguinal ligament runs between which two bony points?', [{ t: 'Anterior superior iliac spine', aka: ['ASIS'] }, { t: 'Pubic tubercle' }], {
    confusables: ['Anterior inferior iliac spine', 'AIIS', 'Pubic crest', 'Pubic symphysis'],
    difficulty: 2,
    reason: 'Basic landmarks.',
  }),
];

export const sampleDeck: Deck = DeckSchema.parse({
  id: 'sample-upper-limb-abdominal-wall',
  name: DECK,
  description: 'Hand-written starter deck: upper limb innervation and the anterior abdominal wall.',
  topics: [UL, AW],
  questions,
});

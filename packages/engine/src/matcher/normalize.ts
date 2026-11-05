/**
 * Text normalization for answer matching.
 *
 * Both player input and bank terms go through the same pipeline, so the rules
 * only need to be *consistent*, not linguistically perfect (e.g. "biceps" →
 * "bicep" on both sides is fine).
 */

/** Class words that players often omit ("median" for "median nerve"). */
export const GENERIC_WORDS: ReadonlySet<string> = new Set(['muscle', 'nerve', 'artery', 'vein', 'ligament']);

/** Words dropped entirely. */
const DROP_WORDS: ReadonlySet<string> = new Set(['the', 'of', 'to', 'and', 'for', 'a', 'an']);

/** Abbreviations written with a trailing period: "m.", "n.", "a.", "lig.". */
const DOTTED_ABBREVIATIONS: Record<string, string> = {
  m: 'muscle',
  mm: 'muscle',
  n: 'nerve',
  nn: 'nerve',
  a: 'artery',
  aa: 'artery',
  v: 'vein',
  vv: 'vein',
  lig: 'ligament',
  ligs: 'ligament',
  ligg: 'ligament',
  br: 'branch',
  brs: 'branch',
  ant: 'anterior',
  post: 'posterior',
  sup: 'superior',
  inf: 'inferior',
  med: 'medial',
  lat: 'lateral',
};

/** Abbreviations accepted without a period. ("a" is excluded: too ambiguous.) */
const BARE_ABBREVIATIONS: Record<string, string> = {
  m: 'muscle',
  mm: 'muscle',
  n: 'nerve',
  nn: 'nerve',
  v: 'vein',
  vv: 'vein',
  lig: 'ligament',
  ligs: 'ligament',
  ligg: 'ligament',
  br: 'branch',
  mus: 'muscle',
  musc: 'muscle',
  art: 'artery',
};

const ORDINALS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  '1st': '1',
  '2nd': '2',
  '3rd': '3',
  '4th': '4',
  '5th': '5',
  '6th': '6',
  '7th': '7',
  '8th': '8',
  '9th': '9',
  '10th': '10',
  '11th': '11',
  '12th': '12',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
};

/** British → American spellings and Latin plural → singular, applied per token. */
export function normalizeToken(raw: string): string {
  let t = raw;
  if (ORDINALS[t]) return ORDINALS[t]!;
  if (BARE_ABBREVIATIONS[t]) return BARE_ABBREVIATIONS[t]!;
  if (/^\d/.test(t) || t.length <= 3) return t;

  // Latin plural "-ae" → "-a" (vertebrae, fasciae, latae)
  if (t.length > 4 && t.endsWith('ae')) t = t.slice(0, -1);
  // English / Latin plurals
  else if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
  else if (t.endsWith('sses')) t = t.slice(0, -2);
  else if (/(ches|shes|xes|uses)$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s') && !/(ss|us|is|ous)$/.test(t)) t = t.slice(0, -1);
  // Latin plural "-i" → "-us" (interossei, radii, nuclei, fasciculi)
  else if (t.length >= 5 && t.endsWith('i')) t = t.slice(0, -1) + 'us';

  // British "ae"/"oe" digraphs (haem → hem, oesophagus → esophagus, coeliac → celiac)
  t = t.replace(/ae/g, 'e').replace(/oe/g, 'e');
  // "-eous"/"-ous" → "-us" (interosseous ~ interosseus)
  if (t.endsWith('ous')) t = t.slice(0, -3) + 'us';
  // "-tre"/"-bre" → "-ter"/"-ber" (centre, fibre)
  t = t.replace(/([bt])re$/, '$1er');
  return t;
}

export interface NormalizedTerm {
  /** All significant tokens. */
  tokens: string[];
  /** Tokens minus generic class words ("median nerve" → ["median"]). Never empty if tokens isn't. */
  core: string[];
  /** Generic class words present. */
  generics: string[];
  /** tokens joined by spaces — the lookup key. */
  key: string;
}

export function normalize(input: string): NormalizedTerm {
  let s = input.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/['’`´]/g, ''); // Erb's → erbs
  s = s.replace(/&/g, ' and ');
  // Dotted abbreviations must be handled before punctuation is stripped.
  s = s.replace(/\b([a-z]{1,4})\.(?=\s|$|[,;)\]])/g, (m, w: string) => {
    const exp = DOTTED_ABBREVIATIONS[w];
    return exp ? ` ${exp} ` : m;
  });
  // Split letter/digit boundaries in spinal levels written like "C5-6" stay intact as tokens.
  s = s.replace(/[^a-z0-9]+/g, ' ');

  const tokens: string[] = [];
  for (const raw of s.split(' ')) {
    if (!raw) continue;
    const t = normalizeToken(raw);
    if (DROP_WORDS.has(t)) continue;
    tokens.push(t);
  }
  const core = tokens.filter((t) => !GENERIC_WORDS.has(t));
  const generics = tokens.filter((t) => GENERIC_WORDS.has(t));
  return {
    tokens,
    core: core.length ? core : tokens,
    generics: core.length ? generics : [],
    key: tokens.join(' '),
  };
}

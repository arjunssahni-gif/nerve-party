import { z } from 'zod';

/** One acceptable answer (a list item, a set/ordered part, or the single correct term). */
export const AnswerSchema = z.object({
  id: z.string().min(1),
  /** Canonical display text, e.g. "Flexor digitorum superficialis". */
  text: z.string().min(1),
  /** Abbreviations, alternate names, eponyms, spelling variants. */
  aliases: z.array(z.string().min(1)).default([]),
  /** True when the model added this item from standard references (not in the notes). */
  supplemented: z.boolean().default(false),
  /** Reviewers can switch individual answers off (e.g. supplemented ones). */
  enabled: z.boolean().default(true),
  /** 1 = everyone names it, 3 = rarely named. Used for the bonus-life rule until stats exist. */
  obscurity: z.number().int().min(1).max(3).default(1),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const SourceRefSchema = z.object({
  page: z.number().int().positive().optional(),
  slide: z.number().int().positive().optional(),
  snippet: z.string().default(''),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/** Groups single questions about one structure, asked in order in "continuous" mode. */
export const ClusterSchema = z.object({
  id: z.string().min(1),
  /** The structure, e.g. "Rectus abdominis". */
  entity: z.string().min(1),
  /** The aspect asked, e.g. "origin", "insertion", "innervation". */
  facet: z.string().min(1),
  order: z.number().int().nonnegative(),
});
export type Cluster = z.infer<typeof ClusterSchema>;

export const QuestionTypeSchema = z.enum(['list', 'single']);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * How a single question is answered.
 * - term: one free-response answer
 * - set: several free-response parts, any order
 * - ordered: arrange tiles (answers + distractors) in the right order
 * - mc: pick one option (answers[0] is correct, distractors are the wrong options) — one try
 * - tf: true/false (answers[0].text is "true" or "false") — one try
 */
export const AnswerFormatSchema = z.enum(['term', 'set', 'ordered', 'mc', 'tf']);
export type AnswerFormat = z.infer<typeof AnswerFormatSchema>;

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    topic: z.string().min(1),
    sourceDeck: z.string().min(1),
    sourceRef: SourceRefSchema.default({ snippet: '' }),
    type: QuestionTypeSchema,
    /** Required for single questions; list questions are always free response. */
    answerFormat: AnswerFormatSchema.optional(),
    prompt: z.string().min(1),
    answers: z.array(AnswerSchema).min(1),
    /** Plausible wrong answers; used by the matcher to block near-misses. */
    confusables: z.array(z.string().min(1)).default([]),
    /** Wrong options for mc, or extra tiles for ordered. */
    distractors: z.array(z.string().min(1)).default([]),
    difficulty: z.number().min(1).max(5),
    difficultyReason: z.string().default(''),
    completeness: z.enum(['from_notes', 'supplemented']).default('from_notes'),
    cluster: ClusterSchema.optional(),
    /** Optional short explanation shown on reveal. */
    explanation: z.string().optional(),
    reviewStatus: z.enum(['draft', 'accepted']).default('accepted'),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'single' && !q.answerFormat) {
      ctx.addIssue({ code: 'custom', message: 'single questions need an answerFormat', path: ['answerFormat'] });
    }
    if (q.type === 'list' && q.answerFormat && q.answerFormat !== 'set') {
      ctx.addIssue({ code: 'custom', message: 'list questions are free response', path: ['answerFormat'] });
    }
    if (q.answerFormat === 'mc' && q.distractors.length < 1) {
      ctx.addIssue({ code: 'custom', message: 'mc needs at least one distractor', path: ['distractors'] });
    }
    if (q.answerFormat === 'tf') {
      const t = q.answers[0]?.text.toLowerCase();
      if (q.answers.length !== 1 || (t !== 'true' && t !== 'false')) {
        ctx.addIssue({ code: 'custom', message: 'tf needs exactly one answer "true" or "false"', path: ['answers'] });
      }
    }
    if ((q.answerFormat === 'term' || q.answerFormat === 'mc') && q.answers.length !== 1) {
      ctx.addIssue({ code: 'custom', message: `${q.answerFormat} needs exactly one answer`, path: ['answers'] });
    }
    if (q.answerFormat === 'ordered' && q.answers.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'ordered needs at least two parts', path: ['answers'] });
    }
    const ids = new Set<string>();
    for (const a of q.answers) {
      if (ids.has(a.id)) ctx.addIssue({ code: 'custom', message: `duplicate answer id ${a.id}`, path: ['answers'] });
      ids.add(a.id);
    }
  });
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionInput = z.input<typeof QuestionSchema>;

export const DeckSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  /** Topics in the order they should be played. */
  topics: z.array(z.string()).default([]),
  questions: z.array(QuestionSchema),
  createdAt: z.string().optional(),
  schemaVersion: z.literal(1).default(1),
});
export type Deck = z.infer<typeof DeckSchema>;
export type DeckInput = z.input<typeof DeckSchema>;

export const GameModeSchema = z.enum(['list', 'single', 'mixed']);
export type GameMode = z.infer<typeof GameModeSchema>;

export const GameSettingsSchema = z
  .object({
    mode: GameModeSchema.default('mixed'),
    /** Single phase: random across material, or walk one structure at a time. */
    singleOrder: z.enum(['shuffle', 'continuous']).default('shuffle'),
    /** Mixed mode: list rounds per list phase, laps per single phase. */
    mixedListRounds: z.number().int().min(1).max(20).default(1),
    mixedSingleLaps: z.number().int().min(1).max(20).default(2),
    lives: z.number().int().min(1).max(5).default(2),
    /** Hidden round fuse, drawn uniformly in [fuseMinMs, fuseMaxMs]. */
    fuseMinMs: z.number().int().min(1000).default(30_000),
    fuseMaxMs: z.number().int().min(1000).default(60_000),
    /** Guaranteed time for each new holder, ramping from start to end over rampTurns turns. */
    turnMinStartMs: z.number().int().min(500).default(15_000),
    turnMinEndMs: z.number().int().min(500).default(5_000),
    turnMinRampTurns: z.number().int().min(1).default(30),
    /** List rounds end after this many fires on the same question. */
    listMaxFires: z.number().int().min(1).max(10).default(2),
    /** Voltage spike (fuse shortened) for each wrong word-bank order. */
    orderPenaltyMs: z.number().int().min(0).default(3_000),
    /** Bonus "remyelination" life for rare answers. */
    bonusLives: z.boolean().default(true),
    bonusEvery: z.number().int().min(1).default(3),
    maxLives: z.number().int().min(1).max(9).default(5),
    revealMs: z.number().int().min(0).default(7_000),
    firedMs: z.number().int().min(0).default(2_000),
    /** Single-phase difficulty band: centre starts here and rises per lap. */
    bandStart: z.number().min(1).max(5).default(1.5),
    bandRise: z.number().min(0).max(2).default(0.3),
    bandWidth: z.number().min(0.25).max(4).default(0.75),
    /** Topics in play (null = all). */
    topics: z.array(z.string()).nullable().default(null),
    seed: z.number().int().optional(),
  })
  .refine((s) => s.fuseMaxMs >= s.fuseMinMs, { message: 'fuseMaxMs must be >= fuseMinMs' });
export type GameSettings = z.infer<typeof GameSettingsSchema>;
export type GameSettingsInput = z.input<typeof GameSettingsSchema>;

export function parseSettings(input: GameSettingsInput = {}): GameSettings {
  return GameSettingsSchema.parse(input);
}

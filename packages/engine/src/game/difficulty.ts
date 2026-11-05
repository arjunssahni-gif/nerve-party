/** Per-question play statistics (recorded by the server, phase 5). */
export interface QuestionStats {
  attempts: number;
  correct: number;
  /** Sum of time-to-answer over correct attempts, ms. */
  totalCorrectMs: number;
}

export interface CalibrationOptions {
  /** Attempts needed before stats influence difficulty. */
  minAttempts?: number;
  /** A "normal" time to answer; slower answers push difficulty up a little. */
  expectedMs?: number;
  /** Weight of stats once fully trusted (0..1). */
  statsWeight?: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Effective difficulty 1–5. Uses the model's estimate until there is enough
 * data, then blends in correct rate (main signal) and answer speed.
 */
export function effectiveDifficulty(prior: number, stats?: QuestionStats, opts: CalibrationOptions = {}): number {
  const { minAttempts = 10, expectedMs = 10_000, statsWeight = 0.7 } = opts;
  if (!stats || stats.attempts < minAttempts) return prior;
  const rate = stats.correct / stats.attempts;
  const avgMs = stats.correct > 0 ? stats.totalCorrectMs / stats.correct : expectedMs * 2;
  const speedAdj = clamp((avgMs / expectedMs - 1) * 0.5, -0.5, 0.5);
  const observed = clamp(1 + 4 * (1 - rate) + speedAdj, 1, 5);
  // Trust grows from minAttempts to 3× minAttempts.
  const trust = statsWeight * clamp((stats.attempts - minAttempts) / (2 * minAttempts) + 0.5, 0.5, 1);
  return clamp(prior * (1 - trust) + observed * trust, 1, 5);
}

/** Centre of the single-question difficulty band for a given lap. */
export function bandCenter(lapIndex: number, start: number, rise: number): number {
  return clamp(start + lapIndex * rise, 1, 5);
}

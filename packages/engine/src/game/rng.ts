/**
 * Deterministic PRNG (mulberry32). The state is a plain uint32 stored in the
 * game state, so games are reproducible and serialisable.
 */
export function nextRandom(state: number): [value: number, nextState: number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export interface HasRng {
  rng: number;
}

export function random(s: HasRng): number {
  const [v, n] = nextRandom(s.rng);
  s.rng = n;
  return v;
}

export function randomInt(s: HasRng, min: number, max: number): number {
  return min + Math.floor(random(s) * (max - min + 1));
}

export function pick<T>(s: HasRng, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random(s) * items.length)];
}

export function shuffle<T>(s: HasRng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

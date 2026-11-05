/**
 * Split one submission into several parts ("C5, C6" / "C5 and C6").
 * Callers should try the whole string first; this is the fallback.
 */
export function splitParts(text: string): string[] {
  const coarse = text
    .split(/[,;\n/]|\s+\+\s+|\s*→\s*|\s*->\s*|\s+then\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const piece of coarse) {
    const fine = piece.split(/\s+(?:and|&)\s+/i).map((s) => s.trim()).filter(Boolean);
    out.push(...fine);
  }
  return out;
}

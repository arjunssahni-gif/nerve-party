import { DeckSchema, sampleDeck, type Deck } from '@nerve/shared';
import { load, save } from './storage';

const KEY = 'np.decks.v1';

/** Decks the user imported (sample deck is always available and not stored). */
export function loadImportedDecks(): Deck[] {
  const raw = load<unknown[]>(KEY, []);
  const out: Deck[] = [];
  for (const d of raw) {
    const r = DeckSchema.safeParse(d);
    if (r.success) out.push(r.data);
  }
  return out;
}

export function allDecks(): Deck[] {
  return [sampleDeck, ...loadImportedDecks()];
}

export function saveImportedDeck(deck: Deck): void {
  const decks = loadImportedDecks().filter((d) => d.id !== deck.id);
  decks.push(deck);
  save(KEY, decks);
}

export function deleteImportedDeck(id: string): void {
  save(
    KEY,
    loadImportedDecks().filter((d) => d.id !== id),
  );
}

/** Parse a deck JSON file; returns a readable error instead of throwing. */
export function parseDeckJson(text: string): { deck?: Deck; error?: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
  const r = DeckSchema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    return { error: `Not a Nerve Party deck: ${first?.path.join('.') || 'root'} — ${first?.message}` };
  }
  if (r.data.id === sampleDeck.id) return { deck: { ...r.data, id: `${r.data.id}-copy-${Date.now()}` } };
  return { deck: r.data };
}

export function playableTopics(deck: Deck): string[] {
  const topics = deck.topics.length ? [...deck.topics] : [];
  for (const q of deck.questions) if (!topics.includes(q.topic)) topics.push(q.topic);
  return topics;
}

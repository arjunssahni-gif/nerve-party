import { deckProgress, mergeProgress, progressFromGame, type DeckProgress, type GameState, type ProgressMap } from '@nerve/engine';
import type { Deck } from '@nerve/shared';
import { load, remove, save } from './storage';

/**
 * Local progress per player name per deck. (Accounts arrive with online play;
 * this browser-local store is migrated then.)
 */
const key = (player: string, deckId: string) => `np.progress.v1.${player.trim().toLowerCase()}.${deckId}`;

export function loadProgress(player: string, deckId: string): ProgressMap {
  return load<ProgressMap>(key(player, deckId), {});
}

export function resetProgress(player: string, deckId: string): void {
  remove(key(player, deckId));
}

export function getDeckProgress(player: string, deck: Deck): DeckProgress {
  return deckProgress(deck.questions, loadProgress(player, deck.id));
}

/** Save what a game taught each player. */
export function recordGame(state: GameState, deckId: string): void {
  const results = progressFromGame(state);
  for (const p of state.players) {
    const r = results[p.id];
    if (!r) continue;
    save(key(p.name, deckId), mergeProgress(loadProgress(p.name, deckId), r));
  }
}

const NAMES = 'np.names.v1';
export function recentNames(): string[] {
  return load<string[]>(NAMES, []);
}
export function rememberNames(names: string[]): void {
  const merged = [...new Set([...names.map((n) => n.trim()).filter(Boolean), ...recentNames()])].slice(0, 12);
  save(NAMES, merged);
}

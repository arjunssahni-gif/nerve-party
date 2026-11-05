# Nerve Party

A real-time study party game built from your own lecture notes. A light-blue impulse
travels around a ring of players; each turn you name an answer before the membrane
potential reaches threshold. If an **action potential fires** on your turn, you lose a life.

See [DESIGN.md](DESIGN.md) for the full game design.

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Game engine + answer matcher + tests + sample anatomy deck | ✅ done |
| 2 | Solo + hot-seat browser UI | next |
| 3 | Upload notes → generated question bank → review screen | |
| 4 | Online multiplayer, accounts, saved progress | |
| 5 | Difficulty calibration, sound, accessibility, deploy guide | |

## Setup

Requires **Node.js 20+** (22 recommended).

```bash
npm install
```

## Run the tests

```bash
npm test            # all unit tests (matcher + engine)
npm run typecheck   # TypeScript type check
```

## Try the answer checker

```bash
npm run matcher -- --list
npm run matcher -- l-median-muscles "FDS" "flexor digitorum sublimis" "flexor digitorum profundus medial half"
```

Each answer after the question id is checked in order (accepted answers count as used).

## Project layout

```
packages/shared   zod schemas (Question, Deck, GameSettings) + the sample anatomy deck
packages/engine   pure TypeScript game engine and answer matcher (no I/O, no timers)
  src/matcher/      normalize → alias/exact → typo tolerance → confusable guard
  src/game/         state machine (reduce), view (what clients see), summary, progress
  test/             matcher.test.ts, engine.test.ts
scripts/          small command-line helpers
```

### How the engine works

- `reduce(ctx, state, event) → { state, effects }`: a pure function. Events are
  `start`, `submit`, `tick`, `continue`, `removePlayer`, and every event carries `now`.
- The engine never sets timers itself. It returns a `schedule` effect with the next
  deadline (fuse threshold or end of a reveal), and the caller (the browser for solo
  and hot-seat, the server for online play) sends a `tick` at that time.
- `viewGame()` produces the client-safe view: no hidden fuse time, no unrevealed answers.

### How answer checking works

1. **Normalize:** lowercase; strip punctuation and diacritics; expand `m.`, `n.`, `a.`, `lig.`;
   drop "the"; treat plurals and Latin plurals the same (interossei = interosseous);
   map British spellings to American (oesophagus = esophagus); turn ordinals into numbers.
2. **Exact or alias match** against every term in the bank.
3. **Typo tolerance per word**, scaled by length: words of 4 letters or fewer, such as
   abbreviations like FDS or APB, must match exactly.
4. **Confusable guard:** a typo-corrected word is rejected if it is itself another real
   anatomical word, or is at least as close to one (abductor ≠ adductor, major ≠ minor,
   superficialis ≠ profundus). Each question's listed confusables are always rejected.
5. Result: `accepted | already_used | wrong | ambiguous`, plus the matched canonical answer.

## Defaults (all configurable)

| Setting | Default |
|---|---|
| Hidden round fuse | 30–60 s |
| Guaranteed time per turn | 15 s → 5 s over the first 30 turns |
| Lives | 2 (1–5) |
| List round ends after | all answers named, or 2 fires on the same question |
| Wrong word-bank order | +3 s voltage spike |
| Multiple choice / true-false | one try (wrong = fire) |
| Bonus life | every 3 rare answers |

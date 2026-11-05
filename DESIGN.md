# Nerve Party — Design

A real-time, browser-based study party game. Questions are generated from your own
lecture notes. A signal travels around a ring of players; if the membrane potential
reaches threshold on your turn, an **action potential fires** and you lose a life.

## Theme & visual language

Keep it calm, clean and readable — one strong visual idea, not a busy one.

- **Dark background** (deep navy / near-black), neutral greys for UI, one accent:
  **light-blue glowing impulse** (cyan ~#5ce1ff with soft bloom).
- **The ring:** players sit as nodes on a thin circular axon. The impulse is a glowing
  light-blue pulse that travels along the ring to whoever's turn it is. The active node
  glows; everyone else is dim. That is the *only* "whose turn" signal you need.
- **Membrane potential meter:** a simple bar/arc under the active player, −70 mV → −55 mV
  threshold. Fuse time is hidden; the meter accelerates and the glow intensifies near
  threshold.
- **Correct answer:** pulse jumps to the next node.
- **Threshold reached:** a short, clean spike animation on that node + "Action potential —
  you fired" → lose a life.
- **Lives = myelin segments** (small pills beside your name). 0 = out.
- **One-try questions** (multiple choice, true/false): a clear **"ONE TRY"** badge on the
  question card and a lock icon on the submit button, announced to screen readers.
- Colorblind-safe (state never conveyed by color alone), reduced-motion option, keyboard-only play.

## Progress & decks

- Each uploaded material set is a **deck** (bank of questions grouped by topic).
- **Progress rings** per deck and per topic: % of questions mastered (answered correctly)
  and % seen. Shown on the deck library and in the lobby next to each player.
- Progress is saved **per player account** for every player in the game.
- Lobby: host swaps between decks; options **Continue learning** (prioritise questions not
  yet mastered by the players in the room) or **Fresh run** (all questions). Any player can
  reset their own progress on a deck.

## Game structure: phases

Host picks **List only**, **Single only**, or **Mixed** (alternating phases).

### List phase (shared question)
- One question for everyone, e.g. "Name a muscle innervated by the median nerve."
- The signal passes around the ring; each turn the player must give ONE unused valid answer.
- When all answers are used → reveal (missed answers highlighted) → next topic.
- Safety valve: if it fires N times on the same question (default 2) → reveal and move on.

### Single phase (individual questions)
- **Shuffle:** random questions across all selected material; same difficulty band for all
  players within a lap.
- **Continuous:** walks one structure/slide in order across players
  (origin → insertion → innervation → blood supply → action), then the next structure.
  Questions are grouped into **clusters** (entity + ordered facets).
- **Carry-over:** if a player fires before answering, the same question passes to the next
  player. If it goes all the way around unanswered → reveal and move on.

### Answer formats
| Format | Input | Retries |
|---|---|---|
| Free response (~70%, default) | short typed term(s) | unlimited until fire |
| Ordered sequence | drag/click tiles from a word bank into order; all-or-nothing | unlimited, each wrong attempt spikes voltage |
| Multiple choice | choices are confusables (keeps difficulty) | **one try** — wrong = fire + reveal |
| True / false | two buttons | **one try** — wrong = fire + reveal |

Keep typing short without lowering difficulty.

## Timing (all configurable)
- Round fuse (hidden): random 30–60 s.
- Per-turn guaranteed minimum: 15 s early → 5 s late in the game.
- Lives: default 2 (1–5). Bonus "remyelination" life for rare answers (toggle).

## Answer checking (server-authoritative, no LLM at play time)
Normalize → exact/alias via a global term index (whole bank) → length-scaled
Damerau-Levenshtein at string *and* token level (≤4 chars exact only) → confusable guard
(reject if a wrong/used term is as close or closer; near-ties = `ambiguous`) →
`accepted | already_used | wrong | ambiguous` + matched canonical. Post-round disputes;
host-accepted disputes count retroactively and become aliases.

## Architecture
```
packages/shared   zod schemas (Question, Deck, Settings, socket events)
packages/engine   pure TS state machine + matcher (no I/O, no timers; time injected)
apps/server       Fastify REST + Socket.IO rooms, Prisma/SQLite, ingestion, generation, stats
apps/web          Vite + React + Tailwind + Framer Motion
e2e               Playwright two-context smoke test
```
The engine returns effects (`scheduleTick(at)`); drivers own real timers. The same engine
runs solo/hot-seat in the browser and online on the server.

## Build phases
1. Engine + matcher + tests + sample anatomy deck.
2. Solo + hot-seat UI.
3. Ingestion + generation + review screen.
4. Online multiplayer (rooms, accounts, progress sync, reconnects, disputes).
5. Calibration + polish (sound, accessibility, settings). Deploy guide for remote play.

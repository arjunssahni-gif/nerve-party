import type { PlayerView } from '@nerve/engine';
import { Stage } from '../components/stage/Stage';

/**
 * Dev-only: freeze the stage at an exact moment for visual tuning.
 *   /?stagePreview&p=0.5&fire=300&players=5
 */
export function StagePreview() {
  const q = new URLSearchParams(location.search);
  const n = Number(q.get('players') ?? 5);
  const potential = Number(q.get('p') ?? 0.3);
  const fireT = q.get('fire');
  const names = ['Ana', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
  const players: PlayerView[] = names.slice(0, n).map((name, i) => ({
    id: `p${i + 1}`,
    name,
    lives: i === 2 ? 1 : 2,
    maxLives: 2,
    alive: true,
    removed: false,
    isHolder: i === 0,
    bonusProgress: 0,
    bonusEvery: 3,
    correct: 0,
  }));
  const now = 1_000_000;
  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="overflow-hidden rounded-[2rem] border-2 border-line bg-[radial-gradient(ellipse_at_50%_38%,#13213d_0%,#0a1122_45%,#04060c_100%)]">
        <Stage
          players={players}
          holderId="p1"
          viewerId="p1"
          potential={potential}
          now={now}
          fire={fireT !== null ? { playerId: 'p1', at: now - Number(fireT) } : null}
          idle={false}
          reduced={false}
        />
      </div>
    </div>
  );
}

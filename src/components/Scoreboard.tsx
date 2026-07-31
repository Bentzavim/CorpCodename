import type { Team } from '../game/types.js';
import type { PublicGame } from '../room/types.js';

const TEAM_NAME: Record<Team, string> = {
  red: 'Red Benches',
  blue: 'Blue Benches',
  // Violet is an Aldermanic gown colour, and the bench plays alone.
  violet: 'Violet Bench',
};

export function Scoreboard({ game }: { game: PublicGame }) {
  const solo = game.mode === 'solo';
  const benches: Team[] = solo ? ['violet'] : ['red', 'blue'];

  return (
    <div className={`scoreboard ${solo ? 'scoreboard--solo' : ''}`}>
      {benches.map((team) => {
        const left = game.remaining[team];
        const active = !game.winner && !game.lost && game.turn === team;
        const won = game.winner === team;
        return (
          <div
            key={team}
            className={[
              'score',
              `score--${team}`,
              active && 'score--active',
              won && 'score--won',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="score__count">{left}</span>
            <span className="score__team">{TEAM_NAME[team]}</span>
            <span className="score__note">
              {won ? 'winner' : active ? `${left} still to find` : `${left} to find`}
            </span>
          </div>
        );
      })}

      {solo && game.turnsLeft !== null && (
        <div className={`score score--clock ${game.turnsLeft <= 2 ? 'is-low' : ''}`}>
          <span className="score__count">{game.turnsLeft}</span>
          <span className="score__team">Turns left</span>
          <span className="score__note">
            {game.turnsLeft === 1 ? 'last one' : 'a wrong card costs one'}
          </span>
        </div>
      )}
    </div>
  );
}

export { TEAM_NAME };

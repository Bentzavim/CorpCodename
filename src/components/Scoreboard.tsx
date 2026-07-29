import { remaining } from '../game/engine';
import type { GameState, Team } from '../game/types';

const TEAM_NAME: Record<Team, string> = {
  red: 'Red Benches',
  blue: 'Blue Benches',
};

export function Scoreboard({ game }: { game: GameState }) {
  return (
    <div className="scoreboard">
      {(['red', 'blue'] as Team[]).map((team) => {
        const left = remaining(game.cards, team);
        const active = !game.winner && game.turn === team;
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
              {won ? 'winner' : active ? 'to play' : `${left} to find`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { TEAM_NAME };

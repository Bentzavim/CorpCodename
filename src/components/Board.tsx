import type { GameState } from '../game/types';
import { Card } from './Card';

interface Props {
  game: GameState;
  spymaster: boolean;
  onReveal: (index: number) => void;
}

export function Board({ game, spymaster, onReveal }: Props) {
  // Guessing is only open once the spymaster has given a clue for this turn.
  const locked = game.winner !== null || game.guessesLeft === null;

  return (
    <div className="board" role="grid" aria-label="Codenames board">
      {game.cards.map((card, i) => (
        <Card
          key={card.entity.id}
          card={card}
          index={i}
          spymaster={spymaster}
          disabled={locked}
          onReveal={onReveal}
        />
      ))}
    </div>
  );
}

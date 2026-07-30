import type { PublicGame } from '../room/types.js';
import { Card } from './Card.js';

interface Props {
  game: PublicGame;
  /** False for a spymaster online, and for anyone between turns locally. */
  canGuess?: boolean;
  onReveal: (index: number) => void;
}

export function Board({ game, canGuess = true, onReveal }: Props) {
  // Guessing is only open once the spymaster has given a clue for this turn.
  const locked = !canGuess || game.winner !== null || game.guessesLeft === null;

  return (
    <div className="board" role="grid" aria-label="Codenames board">
      {game.cards.map((card, i) => (
        <Card
          key={card.entity.id}
          card={card}
          index={i}
          disabled={locked}
          onReveal={onReveal}
        />
      ))}
    </div>
  );
}

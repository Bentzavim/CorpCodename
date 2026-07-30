import { useEffect, useRef, useState } from 'react';
import type { PublicGame } from '../room/types';
import { TEAM_NAME } from './Scoreboard';

interface Props {
  game: PublicGame;
  onClue: (word: string, count: number | null) => void;
  onPass: () => void;
  /** Online, only the team on turn gets the controls; everyone else watches. */
  canClue?: boolean;
  canGuess?: boolean;
  /** Shown in place of the controls when this player is only watching. */
  watching?: string;
}

/** A clue is one word: no spaces, though hyphens and apostrophes are fine. */
function isOneWord(value: string): boolean {
  return /^\S+$/.test(value.trim());
}

export function ClueBar({
  game,
  onClue,
  onPass,
  canClue = true,
  canGuess = true,
  watching,
}: Props) {
  const [word, setWord] = useState('');
  const [count, setCount] = useState('1');
  const [unlimited, setUnlimited] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const awaitingClue = !game.winner && game.guessesLeft === null;

  // Hand focus to the incoming spymaster as soon as the turn flips.
  useEffect(() => {
    if (awaitingClue) inputRef.current?.focus();
  }, [awaitingClue, game.turn]);

  if (game.winner) {
    return (
      <div className={`cluebar cluebar--over cluebar--${game.winner}`}>
        <strong>{TEAM_NAME[game.winner]} win.</strong>
        <span>{game.endReason}</span>
      </div>
    );
  }

  const current = game.clues[game.clues.length - 1];

  if (awaitingClue && !canClue) {
    return (
      <div className={`cluebar cluebar--${game.turn}`}>
        <span className="cluebar__label">{TEAM_NAME[game.turn]} spymaster</span>
        <span className="cluebar__waiting">{watching ?? 'is thinking of a clue…'}</span>
      </div>
    );
  }

  if (awaitingClue) {
    const typed = word.trim();
    const valid = typed !== '' && isOneWord(typed);

    return (
      <form
        className={`cluebar cluebar--${game.turn}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onClue(typed, unlimited ? null : Number(count) || 0);
          setWord('');
          setCount('1');
          setUnlimited(false);
        }}
      >
        <label className="cluebar__label" htmlFor="clue-word">
          {TEAM_NAME[game.turn]} spymaster’s clue
        </label>
        <input
          id="clue-word"
          ref={inputRef}
          className="cluebar__word"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="one word"
          autoComplete="off"
          aria-invalid={typed !== '' && !valid}
          aria-describedby="clue-hint"
        />
        <input
          className="cluebar__count"
          type="number"
          min={0}
          max={9}
          value={unlimited ? '' : count}
          disabled={unlimited}
          onChange={(e) => setCount(e.target.value)}
          aria-label="Number of cards this clue points to"
        />
        <button
          type="button"
          className={`cluebar__infinity ${unlimited ? 'is-on' : ''}`}
          onClick={() => setUnlimited((u) => !u)}
          aria-pressed={unlimited}
          title="Unlimited — send them after cards left from earlier clues"
        >
          ∞
        </button>
        <button type="submit" className="btn btn--primary" disabled={!valid}>
          Give clue
        </button>
        <span id="clue-hint" className="cluebar__hint" role={valid ? undefined : 'alert'}>
          {typed !== '' && !valid
            ? 'One word only.'
            : unlimited
              ? 'Unlimited: guess until you get one wrong.'
              : count === '0'
                ? 'Zero: none of your cards. Guess until you get one wrong.'
                : ''}
        </span>
      </form>
    );
  }

  const uncapped = game.guessesLeft === 'unlimited';

  return (
    <div className={`cluebar cluebar--${game.turn}`}>
      <span className="cluebar__label">{TEAM_NAME[game.turn]} guessing</span>
      {current && (
        <span className="cluebar__clue">
          {current.word} <em>{current.count === null ? '∞' : current.count}</em>
        </span>
      )}
      <span className="cluebar__left">
        {uncapped
          ? 'unlimited guesses'
          : `${game.guessesLeft} ${game.guessesLeft === 1 ? 'guess' : 'guesses'} left`}
      </span>
      {canGuess ? (
        <button type="button" className="btn" onClick={onPass}>
          End turn
        </button>
      ) : (
        watching && <span className="cluebar__waiting">{watching}</span>
      )}
    </div>
  );
}

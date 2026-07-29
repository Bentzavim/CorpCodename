import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { TEAM_NAME } from './Scoreboard';

interface Props {
  game: GameState;
  onClue: (word: string, count: number) => void;
  onPass: () => void;
}

export function ClueBar({ game, onClue, onPass }: Props) {
  const [word, setWord] = useState('');
  const [count, setCount] = useState('1');
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

  if (awaitingClue) {
    return (
      <form
        className={`cluebar cluebar--${game.turn}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!word.trim()) return;
          onClue(word, Number(count) || 0);
          setWord('');
          setCount('1');
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
        />
        <input
          className="cluebar__count"
          type="number"
          min={0}
          max={9}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          aria-label="Number of cards this clue points to"
        />
        <button type="submit" className="btn btn--primary" disabled={!word.trim()}>
          Give clue
        </button>
      </form>
    );
  }

  return (
    <div className={`cluebar cluebar--${game.turn}`}>
      <span className="cluebar__label">{TEAM_NAME[game.turn]} guessing</span>
      {current && (
        <span className="cluebar__clue">
          {current.word} <em>{current.count}</em>
        </span>
      )}
      <span className="cluebar__left">
        {game.guessesLeft} {game.guessesLeft === 1 ? 'guess' : 'guesses'} left
      </span>
      <button type="button" className="btn" onClick={onPass}>
        End turn
      </button>
    </div>
  );
}

import { remaining } from '../game/engine.js';
import type { GameState } from '../game/types.js';
import { encodeGuesses } from './view.js';
import type { PublicGame } from './types.js';

/**
 * Renders a local, one-device game through the same view type the server sends.
 *
 * Pass-and-play has no secrets to keep — the key card is on the device by
 * definition — so here the spymaster toggle decides what `kind` is set to,
 * exactly where the server's role check decides it online. Both modes then run
 * through one set of components, so a change to the board cannot land in one
 * and miss the other.
 */
export function localPublicGame(game: GameState, spymaster: boolean): PublicGame {
  return {
    cards: game.cards.map((card) => ({
      entity: card.entity,
      revealed: card.revealed,
      kind: card.revealed || spymaster ? card.kind : null,
    })),
    mode: game.mode,
    startingTeam: game.startingTeam,
    turn: game.turn,
    turnsLeft: game.turnsLeft,
    guessesLeft: encodeGuesses(game.guessesLeft),
    clues: game.clues,
    log: game.log,
    winner: game.winner,
    lost: game.lost,
    endReason: game.endReason,
    remaining: {
      red: remaining(game.cards, 'red'),
      blue: remaining(game.cards, 'blue'),
      violet: remaining(game.cards, 'violet'),
    },
  };
}

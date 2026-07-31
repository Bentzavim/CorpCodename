import { createGame, giveClue, isOver, pass, revealCard } from '../game/engine.js';
import { randomSeed } from '../game/rng.js';
import { SEED_MEMBERS, membersToEntities } from '../data/members.js';
import { BOARD_SIZE, type Team } from '../game/types.js';
import { startBlocker } from './view.js';
import { labelFor } from '../game/engine.js';
import type { Player, PlayerId, Room, RoomAction, Seat } from './types.js';

/**
 * Refused for a reason the player should see. Anything that is merely
 * impossible (an unknown action, a card index off the board) is a bug or a
 * tampered request and gets a flat refusal instead.
 */
export class RoomError extends Error {}

const ENTITIES = membersToEntities(SEED_MEMBERS);

function requirePlayer(room: Room, id: PlayerId): Player {
  const player = room.players.find((p) => p.id === id);
  if (!player) throw new RoomError('You are not in this room.');
  return player;
}

/**
 * Whether a player may act, on top of whether the move itself is legal.
 *
 * The engine only ever knew about turns, because until now there was one player
 * holding the device and the honour system did the rest. Over a network the
 * question "may *this* player do this?" has to be asked separately, and it is
 * asked here rather than inside each handler so there is one place to read.
 */
const ACTIONS = new Set<RoomAction['type']>([
  'sit', 'rename', 'mode', 'start', 'clue', 'reveal', 'pass', 'newGame',
]);

/**
 * The union is exhaustive to TypeScript, but the wire is not typed: an action
 * arrives as whatever JSON was posted, so its type has to be checked for real.
 */
function knownAction(action: RoomAction): void {
  if (!ACTIONS.has(action?.type)) throw new RoomError('That is not something you can do.');
}

export function authorise(room: Room, player: Player, action: RoomAction): void {
  knownAction(action);
  const game = room.game;
  const isHost = room.hostId === player.id;

  switch (action.type) {
    case 'sit':
    case 'rename':
      if (game && !isOver(game)) throw new RoomError('The game is under way.');
      return;

    case 'mode':
      if (!isHost) throw new RoomError('Only the host can do that.');
      if (game && !isOver(game)) throw new RoomError('The game is under way.');
      return;

    case 'start':
    case 'newGame':
      if (!isHost) throw new RoomError('Only the host can do that.');
      return;

    case 'clue':
      if (!game) throw new RoomError('The game has not started.');
      if (isOver(game)) throw new RoomError('The game is over.');
      if (player.team !== game.turn) throw new RoomError('It is not your bench\u2019s turn.');
      if (player.seat !== 'spymaster') throw new RoomError('Only the spymaster gives clues.');
      if (game.guessesLeft !== null) throw new RoomError('A clue is already in play.');
      return;

    case 'reveal':
    case 'pass':
      if (!game) throw new RoomError('The game has not started.');
      if (isOver(game)) throw new RoomError('The game is over.');
      if (player.team !== game.turn) throw new RoomError('It is not your bench\u2019s turn.');
      // The spymaster knows the answers, so they do not get to touch the board.
      if (player.seat !== 'operative') throw new RoomError('Only operatives guess.');
      if (game.guessesLeft === null) throw new RoomError('Wait for your spymaster’s clue.');
      return;
  }
}

/** Applies an action to a room, returning the new room. Throws RoomError if refused. */
export function apply(room: Room, playerId: PlayerId, action: RoomAction, now = Date.now()): Room {
  const player = requirePlayer(room, playerId);
  authorise(room, player, action);

  const next: Room = { ...room, players: [...room.players], version: room.version + 1, updatedAt: now };
  const replace = (patch: Partial<Player>) => {
    next.players = next.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p));
  };

  switch (action.type) {
    case 'rename': {
      replace({ name: cleanName(action.name) });
      return next;
    }

    case 'mode': {
      if (action.mode !== 'solo' && action.mode !== 'duel') {
        throw new RoomError('Unknown mode.');
      }
      next.mode = action.mode;
      // The benches on offer change with the mode, so nobody keeps a seat that
      // no longer exists.
      next.players = next.players.map((p) => ({ ...p, team: null, seat: null }));
      next.game = null;
      return next;
    }

    case 'sit': {
      const { team, seat } = action;
      const allowed: Team[] = room.mode === 'solo' ? ['violet'] : ['red', 'blue'];
      if (team !== null && !allowed.includes(team)) {
        throw new RoomError('That bench is not playing this game.');
      }
      if (team !== null && seat === 'spymaster') {
        const taken = room.players.find(
          (p) => p.id !== playerId && p.team === team && p.seat === 'spymaster',
        );
        if (taken) throw new RoomError(`${taken.name} is already ${label(team)} spymaster.`);
      }
      replace({ team, seat: team === null ? null : seat });
      return next;
    }

    case 'start':
    case 'newGame': {
      const blocker = startBlocker(next.players, next.mode);
      if (blocker) throw new RoomError(blocker);
      if (ENTITIES.length < BOARD_SIZE) throw new RoomError('The roster is too short for a board.');
      // A fresh secret each game, so finishing one does not expose the next.
      next.seed = randomSeed(10);
      next.game = createGame(next.seed, 'members', ENTITIES, next.mode);
      return next;
    }

    case 'clue': {
      next.game = giveClue(room.game!, action.word, action.count);
      if (next.game === room.game) throw new RoomError('That clue was not accepted.');
      return next;
    }

    case 'reveal': {
      const game = room.game!;
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= game.cards.length) {
        throw new RoomError('No such card.');
      }
      if (game.cards[action.index].revealed) throw new RoomError('Already turned over.');
      next.game = revealCard(game, action.index);
      return next;
    }

    case 'pass': {
      next.game = pass(room.game!);
      return next;
    }

    default:
      throw new RoomError('That is not something you can do.');
  }
}

export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || 'Anonymous';
}

function label(team: Team): string {
  return labelFor(team);
}

export function emptySeat(): { team: null; seat: Seat | null } {
  return { team: null, seat: null };
}

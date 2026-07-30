import { remaining } from '../game/engine';
import type { Team } from '../game/types';
import {
  DISCONNECT_AFTER_MS,
  type Player,
  type PlayerId,
  type PublicGame,
  type PublicPlayer,
  type PublicRoom,
  type Room,
} from './types';

/**
 * The trust boundary. Everything a client learns about a room comes through
 * here, and the one thing it must never leak is the colour of an unrevealed
 * card to anyone who is not a spymaster.
 *
 * The rule is enforced by construction: `PublicCard` is built field by field
 * from scratch rather than spread from the real card and then trimmed, because
 * a spread plus a `delete` is one careless edit away from putting the key card
 * on the wire.
 */
export function isSpymaster(player: Player | PublicPlayer | undefined): boolean {
  return player?.seat === 'spymaster' && player.team !== null;
}

export function publicPlayer(player: Player, now: number): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    seat: player.seat,
    connected: now - player.lastSeen < DISCONNECT_AFTER_MS,
  };
}

/** JSON has no Infinity, so an uncapped turn travels as a word. */
export function encodeGuesses(left: number | null): number | 'unlimited' | null {
  if (left === null) return null;
  return Number.isFinite(left) ? left : 'unlimited';
}

export function publicGame(room: Room, viewer: Player | undefined): PublicGame | null {
  const game = room.game;
  if (!game) return null;
  const seesKey = isSpymaster(viewer);

  return {
    cards: game.cards.map((card) => ({
      entity: card.entity,
      revealed: card.revealed,
      // Revealed cards are public knowledge; unrevealed ones only to spymasters.
      kind: card.revealed || seesKey ? card.kind : null,
    })),
    startingTeam: game.startingTeam,
    turn: game.turn,
    guessesLeft: encodeGuesses(game.guessesLeft),
    clues: game.clues,
    log: game.log,
    winner: game.winner,
    endReason: game.endReason,
    remaining: {
      red: remaining(game.cards, 'red'),
      blue: remaining(game.cards, 'blue'),
    },
  };
}

/** Why the host cannot start yet, or null when the room is ready. */
export function startBlocker(players: Player[]): string | null {
  const teams: Team[] = ['red', 'blue'];
  for (const team of teams) {
    const seated = players.filter((p) => p.team === team);
    if (!seated.some((p) => p.seat === 'spymaster')) {
      return `${team === 'red' ? 'Red' : 'Blue'} needs a spymaster.`;
    }
    if (!seated.some((p) => p.seat === 'operative')) {
      return `${team === 'red' ? 'Red' : 'Blue'} needs at least one operative.`;
    }
  }
  return null;
}

export function publicRoom(room: Room, viewerId: PlayerId, now = Date.now()): PublicRoom {
  const viewer = room.players.find((p) => p.id === viewerId);
  return {
    code: room.code,
    version: room.version,
    hostId: room.hostId,
    you: viewer
      ? publicPlayer(viewer, now)
      : { id: viewerId, name: '', team: null, seat: null, connected: true },
    players: room.players.map((p) => publicPlayer(p, now)),
    game: publicGame(room, viewer),
    blocker: startBlocker(room.players),
  };
}

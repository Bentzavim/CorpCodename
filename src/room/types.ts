import type { CardKind, Entity, GameMode, GameState, LogEntry, Team } from '../game/types.js';

export type PlayerId = string;
export type Seat = 'spymaster' | 'operative';

export interface Player {
  id: PlayerId;
  name: string;
  team: Team | null;
  seat: Seat | null;
  /** Epoch ms of the last request or stream ping; drives the connected dot. */
  lastSeen: number;
}

/**
 * A room as the server holds it. Never send this to a client — `seed` alone is
 * enough to reconstruct the whole key card, and `game.cards` carries it outright.
 */
export interface Room {
  code: string;
  /** Chosen in the lobby by the host, and fixed once a board is dealt. */
  mode: GameMode;
  /** Secret. The board is derived from it, so it never leaves the server. */
  seed: string;
  hostId: PlayerId;
  players: Player[];
  game: GameState | null;
  /** Bumped on every change, so a reconnecting stream can tell if it missed one. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// What a client is allowed to see
// ---------------------------------------------------------------------------

export interface PublicCard {
  entity: Entity;
  revealed: boolean;
  /**
   * The card's true colour, or null when the viewer may not know it. Absent for
   * an unrevealed card unless the viewer is a spymaster — both spymasters see
   * the same key card, as in the boxed game.
   */
  kind: CardKind | null;
}

export interface PublicGame {
  mode: GameMode;
  cards: PublicCard[];
  startingTeam: Team;
  turn: Team;
  /** Solo only: turns before the clock runs out. */
  turnsLeft: number | null;
  /**
   * `null` until a clue is given, a number while counting down, and the literal
   * 'unlimited' after a clue of 0 or ∞ — JSON has no Infinity to send.
   */
  guessesLeft: number | 'unlimited' | null;
  clues: GameState['clues'];
  log: LogEntry[];
  winner: Team | null;
  /** Solo only: the bench lost, to the assassin or the clock. */
  lost: boolean;
  endReason: string | null;
  remaining: Record<Team, number>;
}

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  team: Team | null;
  seat: Seat | null;
  connected: boolean;
}

export interface PublicRoom {
  code: string;
  mode: GameMode;
  version: number;
  hostId: PlayerId;
  you: PublicPlayer;
  players: PublicPlayer[];
  game: PublicGame | null;
  /** Why the room cannot start yet, or null when it can. */
  blocker: string | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type RoomAction =
  | { type: 'sit'; team: Team | null; seat: Seat | null }
  | { type: 'rename'; name: string }
  | { type: 'mode'; mode: GameMode }
  | { type: 'start' }
  | { type: 'clue'; word: string; count: number | null }
  | { type: 'reveal'; index: number }
  | { type: 'pass' }
  | { type: 'newGame' };

export const ROOM_CODE_LENGTH = 4;
/** Rooms are dropped after this long without a request. */
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const DISCONNECT_AFTER_MS = 20_000;

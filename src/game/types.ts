export type Team = 'red' | 'blue';

/** What is actually under a card. */
export type CardKind = Team | 'neutral' | 'assassin';

/** One entry in a deck — a Member, or a Ward, or anything else pluggable. */
export interface Entity {
  id: string;
  /** Shown large on the card. */
  name: string;
  /** Optional portrait URL. Falls back to a generated avatar when absent. */
  photo?: string;
}

export interface Deck {
  id: string;
  label: string;
  description: string;
  entities: Entity[];
}

export interface BoardCard {
  entity: Entity;
  kind: CardKind;
  revealed: boolean;
}

export interface Clue {
  team: Team;
  word: string;
  /**
   * How many cards the clue points at, or `null` for an unlimited clue — the
   * spymaster saying "unlimited" to send their team after cards left over from
   * earlier clues.
   */
  count: number | null;
}

export type LogEntry =
  | { kind: 'clue'; team: Team; word: string; count: number | null }
  | { kind: 'reveal'; team: Team; name: string; result: CardKind }
  | { kind: 'pass'; team: Team }
  | { kind: 'end'; winner: Team; reason: string };

export interface GameState {
  seed: string;
  deckId: string;
  cards: BoardCard[];
  startingTeam: Team;
  turn: Team;
  /**
   * Remaining guesses this turn. `null` until a clue has been given, and
   * `Infinity` after a clue of 0 or unlimited, both of which lift the cap.
   */
  guessesLeft: number | null;
  clues: Clue[];
  log: LogEntry[];
  winner: Team | null;
  endReason: string | null;
}

export const BOARD_SIZE = 25;
/** Starting team gets 9, the other 8, plus 7 bystanders and 1 assassin. */
export const FIRST_TEAM_CARDS = 9;
export const SECOND_TEAM_CARDS = 8;
export const NEUTRAL_CARDS = 7;
export const ASSASSIN_CARDS = 1;

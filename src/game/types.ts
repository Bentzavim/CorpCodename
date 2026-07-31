/** The two benches face each other; the violet bench plays alone. */
export type Team = 'red' | 'blue' | 'violet';

/** The two sides of a head-to-head game. Solo play never uses these. */
export type DuelTeam = 'red' | 'blue';

/**
 * Head to head, or one bench against the clock. The mode decides how the key
 * card is dealt and what ends a turn, and nothing else.
 */
export type GameMode = 'duel' | 'solo';

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
  | { kind: 'end'; winner: Team | null; reason: string };

export interface GameState {
  seed: string;
  deckId: string;
  mode: GameMode;
  cards: BoardCard[];
  startingTeam: Team;
  turn: Team;
  /**
   * Turns left before the bench runs out of time. Solo only — a head-to-head
   * game ends when a bench runs out of Members, not out of turns.
   */
  turnsLeft: number | null;
  /**
   * Remaining guesses this turn. `null` until a clue has been given, and
   * `Infinity` after a clue of 0 or unlimited, both of which lift the cap.
   */
  guessesLeft: number | null;
  clues: Clue[];
  log: LogEntry[];
  winner: Team | null;
  /**
   * Solo only: the bench lost, to the assassin or the clock. Head to head a loss
   * is always somebody else's win, so `winner` carries it.
   */
  lost: boolean;
  endReason: string | null;
}

export const BOARD_SIZE = 25;
/** Starting team gets 9, the other 8, plus 7 bystanders and 1 assassin. */
export const FIRST_TEAM_CARDS = 9;
export const SECOND_TEAM_CARDS = 8;
export const NEUTRAL_CARDS = 7;
export const ASSASSIN_CARDS = 1;

/**
 * Solo play. The bench gets the same nine Members the opening team gets in a
 * head-to-head game; with no opposition to hand cards to, every other card
 * except the assassin is a bystander.
 */
export const SOLO_TEAM: Team = 'violet';
export const SOLO_TEAM_CARDS = FIRST_TEAM_CARDS;
export const SOLO_NEUTRAL_CARDS = BOARD_SIZE - SOLO_TEAM_CARDS - ASSASSIN_CARDS;
/**
 * How many turns the bench gets. Without a limit the only way to lose would be
 * the assassin, and a patient player would always win eventually — so this is
 * the clock the neutrals cost you.
 */
export const SOLO_TURNS = 9;

import { createRng, shuffle } from './rng';
import {
  ASSASSIN_CARDS,
  BOARD_SIZE,
  FIRST_TEAM_CARDS,
  NEUTRAL_CARDS,
  SECOND_TEAM_CARDS,
  type BoardCard,
  type CardKind,
  type Entity,
  type GameState,
  type Team,
} from './types';

export function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}

/**
 * Builds the key card. The starting team gets the extra card, so the split is
 * always 9/8/7/1 regardless of who goes first.
 */
function buildKinds(startingTeam: Team, rng: () => number): CardKind[] {
  const second = otherTeam(startingTeam);
  const kinds: CardKind[] = [
    ...Array<CardKind>(FIRST_TEAM_CARDS).fill(startingTeam),
    ...Array<CardKind>(SECOND_TEAM_CARDS).fill(second),
    ...Array<CardKind>(NEUTRAL_CARDS).fill('neutral'),
    ...Array<CardKind>(ASSASSIN_CARDS).fill('assassin'),
  ];
  return shuffle(kinds, rng);
}

export class NotEnoughEntitiesError extends Error {
  readonly available: number;

  constructor(available: number) {
    super(`A board needs ${BOARD_SIZE} entries but this deck only has ${available}.`);
    this.name = 'NotEnoughEntitiesError';
    this.available = available;
  }
}

export function createGame(seed: string, deckId: string, entities: Entity[]): GameState {
  if (entities.length < BOARD_SIZE) throw new NotEnoughEntitiesError(entities.length);

  // One rng drives every decision, so the seed fully determines the board.
  const rng = createRng(`${deckId}:${seed}`);
  const picked = shuffle(entities, rng).slice(0, BOARD_SIZE);
  const startingTeam: Team = rng() < 0.5 ? 'red' : 'blue';
  const kinds = buildKinds(startingTeam, rng);

  return {
    seed,
    deckId,
    cards: picked.map((entity, i) => ({ entity, kind: kinds[i], revealed: false })),
    startingTeam,
    turn: startingTeam,
    guessesLeft: null,
    clues: [],
    log: [],
    winner: null,
    endReason: null,
  };
}

export function remaining(cards: BoardCard[], team: Team): number {
  return cards.filter((c) => c.kind === team && !c.revealed).length;
}

/**
 * Records a clue and opens the guessing window: the number of cards named, plus
 * the customary bonus guess.
 *
 * A count of 0 ("none of my cards relate to this") and an unlimited clue both
 * lift the cap entirely, as the rules have it — the team may keep guessing until
 * they get one wrong or stop. `null` is the unlimited clue.
 */
export function giveClue(state: GameState, word: string, count: number | null): GameState {
  if (state.winner) return state;
  const trimmed = word.trim();
  if (!trimmed) return state;
  const safeCount = count === null ? null : Math.max(0, Math.min(9, Math.floor(count)));
  const uncapped = safeCount === null || safeCount === 0;

  return {
    ...state,
    clues: [...state.clues, { team: state.turn, word: trimmed, count: safeCount }],
    guessesLeft: uncapped ? Number.POSITIVE_INFINITY : safeCount + 1,
    log: [...state.log, { kind: 'clue', team: state.turn, word: trimmed, count: safeCount }],
  };
}

function endTurn(state: GameState): GameState {
  return { ...state, turn: otherTeam(state.turn), guessesLeft: null };
}

export function pass(state: GameState): GameState {
  if (state.winner || state.guessesLeft === null) return state;
  return { ...endTurn(state), log: [...state.log, { kind: 'pass', team: state.turn }] };
}

export function revealCard(state: GameState, index: number): GameState {
  if (state.winner) return state;
  // A team may only guess once its spymaster has actually given a clue.
  if (state.guessesLeft === null) return state;

  const card = state.cards[index];
  if (!card || card.revealed) return state;

  const guessingTeam = state.turn;
  const cards = state.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c));
  let next: GameState = {
    ...state,
    cards,
    log: [
      ...state.log,
      { kind: 'reveal', team: guessingTeam, name: card.entity.name, result: card.kind },
    ],
  };

  if (card.kind === 'assassin') {
    const winner = otherTeam(guessingTeam);
    return {
      ...next,
      winner,
      guessesLeft: null,
      endReason: `${labelFor(guessingTeam)} picked the assassin.`,
      log: [
        ...next.log,
        { kind: 'end', winner, reason: `${labelFor(guessingTeam)} picked the assassin.` },
      ],
    };
  }

  // Revealing any team's card can finish that team off, including the opponent's.
  const finished = (['red', 'blue'] as Team[]).find((t) => remaining(cards, t) === 0);
  if (finished) {
    const reason = `${labelFor(finished)} found all their Members.`;
    return {
      ...next,
      winner: finished,
      guessesLeft: null,
      endReason: reason,
      log: [...next.log, { kind: 'end', winner: finished, reason }],
    };
  }

  if (card.kind === guessingTeam) {
    const left = (state.guessesLeft ?? 1) - 1;
    // Out of guesses ends the turn; otherwise they may keep going.
    next = left <= 0 ? endTurn(next) : { ...next, guessesLeft: left };
    return next;
  }

  // Bystander or the opposition's card — the turn is over either way.
  return endTurn(next);
}

export function labelFor(team: Team): string {
  return team === 'red' ? 'Red' : 'Blue';
}

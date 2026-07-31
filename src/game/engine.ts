import { createRng, shuffle } from './rng.js';
import {
  ASSASSIN_CARDS,
  BOARD_SIZE,
  FIRST_TEAM_CARDS,
  NEUTRAL_CARDS,
  SECOND_TEAM_CARDS,
  SOLO_NEUTRAL_CARDS,
  SOLO_TEAM,
  SOLO_TEAM_CARDS,
  SOLO_TURNS,
  type BoardCard,
  type CardKind,
  type DuelTeam,
  type Entity,
  type GameMode,
  type GameState,
  type Team,
} from './types.js';

export function otherTeam(team: DuelTeam): DuelTeam {
  return team === 'red' ? 'blue' : 'red';
}

export function isSolo(state: GameState): boolean {
  return state.mode === 'solo';
}

/** True once the game is decided — won head to head, or won or lost solo. */
export function isOver(state: GameState): boolean {
  return state.winner !== null || state.lost;
}

/**
 * Builds the key card.
 *
 * Head to head the starting team gets the extra card, so the split is always
 * 9/8/7/1 whoever goes first. Solo the bench gets that same nine, and with no
 * opposition to hand a card to, everything else but the assassin is a bystander.
 */
function buildKinds(mode: GameMode, startingTeam: Team, rng: () => number): CardKind[] {
  const kinds: CardKind[] =
    mode === 'solo'
      ? [
          ...Array<CardKind>(SOLO_TEAM_CARDS).fill(SOLO_TEAM),
          ...Array<CardKind>(SOLO_NEUTRAL_CARDS).fill('neutral'),
          ...Array<CardKind>(ASSASSIN_CARDS).fill('assassin'),
        ]
      : [
          ...Array<CardKind>(FIRST_TEAM_CARDS).fill(startingTeam),
          ...Array<CardKind>(SECOND_TEAM_CARDS).fill(otherTeam(startingTeam as DuelTeam)),
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

export function createGame(
  seed: string,
  deckId: string,
  entities: Entity[],
  mode: GameMode = 'duel',
): GameState {
  if (entities.length < BOARD_SIZE) throw new NotEnoughEntitiesError(entities.length);

  // One rng drives every decision, so the seed fully determines the board.
  const rng = createRng(`${deckId}:${mode}:${seed}`);
  const picked = shuffle(entities, rng).slice(0, BOARD_SIZE);
  const startingTeam: Team = mode === 'solo' ? SOLO_TEAM : rng() < 0.5 ? 'red' : 'blue';
  const kinds = buildKinds(mode, startingTeam, rng);

  return {
    seed,
    deckId,
    mode,
    cards: picked.map((entity, i) => ({ entity, kind: kinds[i], revealed: false })),
    startingTeam,
    turn: startingTeam,
    turnsLeft: mode === 'solo' ? SOLO_TURNS : null,
    guessesLeft: null,
    clues: [],
    log: [],
    winner: null,
    lost: false,
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
  if (isOver(state)) return state;
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

/**
 * Ends the turn. Head to head that hands over to the other bench; solo there is
 * nobody to hand to, so the turn simply costs one off the clock.
 */
function endTurn(state: GameState): GameState {
  if (state.mode === 'solo') {
    const turnsLeft = Math.max(0, (state.turnsLeft ?? 0) - 1);
    const spent: GameState = { ...state, turnsLeft, guessesLeft: null };
    if (turnsLeft > 0) return spent;
    const reason = 'The bench ran out of turns.';
    return {
      ...spent,
      winner: null,
      lost: true,
      endReason: reason,
      log: [...spent.log, { kind: 'end', winner: null, reason }],
    };
  }
  return { ...state, turn: otherTeam(state.turn as DuelTeam), guessesLeft: null };
}

export function pass(state: GameState): GameState {
  if (isOver(state) || state.guessesLeft === null) return state;
  const passed = { ...state, log: [...state.log, { kind: 'pass' as const, team: state.turn }] };
  return endTurn(passed);
}


export function revealCard(state: GameState, index: number): GameState {
  if (isOver(state)) return state;
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
    const reason = `${labelFor(guessingTeam)} picked the assassin.`;
    // Solo there is nobody to hand the win to — the game is simply lost.
    const winner = state.mode === 'solo' ? null : otherTeam(guessingTeam as DuelTeam);
    return {
      ...next,
      winner,
      lost: winner === null,
      guessesLeft: null,
      endReason: reason,
      log: [...next.log, { kind: 'end', winner, reason }],
    };
  }

  // Revealing any team's card can finish that team off, including the opponent's.
  const contenders: Team[] = state.mode === 'solo' ? [SOLO_TEAM] : ['red', 'blue'];
  const finished = contenders.find((t) => remaining(cards, t) === 0);
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
  if (team === 'red') return 'Red';
  return team === 'blue' ? 'Blue' : 'The Violet Bench';
}

import { BOARD_SIZE, type Deck, type Entity } from '../game/types';
import { loadRoster, membersToEntities } from './members';
import { WARD_ENTITIES } from './wards';

export const MEMBERS_DECK_ID = 'members';
export const WARDS_DECK_ID = 'wards';

export function buildDecks(): Deck[] {
  const members: Entity[] = membersToEntities(loadRoster());

  return [
    {
      id: MEMBERS_DECK_ID,
      label: 'Members',
      description:
        'Aldermen and Common Councillors of the City of London Corporation.',
      entities: members,
    },
    {
      id: WARDS_DECK_ID,
      label: 'Wards',
      description: 'The 25 Wards that elect the Court of Common Council.',
      entities: WARD_ENTITIES,
    },
  ];
}

export function isPlayable(deck: Deck): boolean {
  return deck.entities.length >= BOARD_SIZE;
}

/** Prefers Members, but falls back to Wards when the roster is still a stub. */
export function defaultDeckId(decks: Deck[]): string {
  const members = decks.find((d) => d.id === MEMBERS_DECK_ID);
  if (members && isPlayable(members)) return MEMBERS_DECK_ID;
  return WARDS_DECK_ID;
}

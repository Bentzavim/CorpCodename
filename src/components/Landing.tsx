import type { GameMode } from '../game/types.js';
import {
  BOARD_SIZE,
  FIRST_TEAM_CARDS,
  RELAY_TEAM_CARDS,
  RELAY_TURNS,
  SECOND_TEAM_CARDS,
} from '../game/types.js';

/** One screen between everyone, or a screen each. */
export type Venue = 'screen' | 'online';

interface Props {
  rosterCount: number;
  onPlay: (mode: GameMode, venue: Venue) => void;
  /** Someone who was given a room code rather than a link. */
  onJoinWithCode: () => void;
  rules: React.ReactNode;
}

interface Route {
  mode: GameMode;
  /** Kept on the card as a heading, not as a chip: it is the name of the game. */
  title: string;
  who: string;
  blurb: string;
  /**
   * In the order they are offered. The first is the primary button, and both
   * routes lead with online: a screen each is the way most people play, and it
   * is the only way that works when the players are not in the same room.
   */
  ways: { venue: Venue; label: string; note: string }[];
}

const ROUTES: Route[] = [
  {
    mode: 'duel',
    title: 'Red v Blue',
    who: 'Four or more',
    blurb:
      `Two benches race. One is dealt ${FIRST_TEAM_CARDS} Members and the other ` +
      `${SECOND_TEAM_CARDS}, and the first to have all of theirs turned face up wins. ` +
      'Each bench needs a spymaster, who can see the key card, and at least one ' +
      'operative, who cannot.',
    ways: [
      {
        venue: 'online',
        label: 'Open an online room',
        note: 'a screen each; share a four-letter code',
      },
      {
        venue: 'screen',
        label: 'Round one screen',
        note: 'pass the device — it covers up between turns',
      },
    ],
  },
  {
    mode: 'relay',
    title: 'Violet, two players',
    who: 'Exactly two',
    blurb:
      `One bench against the clock: ${RELAY_TEAM_CARDS} Members to find in ${RELAY_TURNS} ` +
      'turns. There is no opposition, so every card that is not yours and not the assassin ' +
      'is a bystander — and each one costs you a turn.',
    ways: [
      {
        venue: 'online',
        label: 'Send a link back and forth',
        note: 'clue, send, guess, send back',
      },
      {
        venue: 'screen',
        label: 'Round one screen',
        note: 'pass the device between you',
      },
    ],
  },
];

/**
 * The first thing you see: what the game is, and the ways to play it.
 *
 * It stands in front of the board only when the URL names neither a seed nor a
 * room — a shared link is a decision already made, and putting a menu in front
 * of it would be asking a question the sender already answered.
 */
export function Landing({ rosterCount, onPlay, onJoinWithCode, rules }: Props) {
  return (
    <div className="landing">
      <header className="landing__head">
        <h1>Corp Codenames</h1>
        <p className="landing__standfirst">
          Codenames, played with the {rosterCount} Members of the City of London Corporation.
          {' '}
          {BOARD_SIZE} are dealt each game; only the spymasters know whose is whose, and
          everyone else has one word to go on.
        </p>
      </header>

      <div className="landing__routes">
        {ROUTES.map((route) => (
          <section key={route.mode} className={`landing__route landing__route--${route.mode}`}>
            <span className="landing__who">{route.who}</span>
            <h2>{route.title}</h2>
            <p>{route.blurb}</p>
            <div className="landing__ways">
              {route.ways.map((way, i) => (
                <button
                  key={way.venue}
                  type="button"
                  className={`btn btn--seat ${i === 0 ? 'btn--primary' : ''}`}
                  onClick={() => onPlay(route.mode, way.venue)}
                  aria-label={`${route.title} — ${way.label}`}
                >
                  {way.label}
                  <span className="btn__note">{way.note}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="landing__foot">
        {rules}
        <button type="button" className="btn btn--ghost" onClick={onJoinWithCode}>
          I have a room code
        </button>
      </footer>
    </div>
  );
}

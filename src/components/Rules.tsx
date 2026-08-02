import { useEffect, useRef } from 'react';
import {
  ASSASSIN_CARDS,
  BOARD_SIZE,
  FIRST_TEAM_CARDS,
  NEUTRAL_CARDS,
  RELAY_NEUTRAL_CARDS,
  RELAY_TEAM_CARDS,
  RELAY_TURNS,
  SECOND_TEAM_CARDS,
  type GameMode,
} from '../game/types.js';

interface Props {
  /** Which mode to lead with. The other is still shown, just second. */
  mode?: GameMode;
  onClose: () => void;
}

/** The key card, as a legend: kind, how many, and what it costs you. */
const DUEL_KEY = [
  { kind: 'red', label: 'the first bench', count: FIRST_TEAM_CARDS, note: 'go again' },
  { kind: 'blue', label: 'the second bench', count: SECOND_TEAM_CARDS, note: 'go again' },
  { kind: 'neutral', label: 'bystanders', count: NEUTRAL_CARDS, note: 'turn over' },
  { kind: 'assassin', label: 'the assassin', count: ASSASSIN_CARDS, note: 'you lose' },
];

const RELAY_KEY = [
  { kind: 'violet', label: 'your Members', count: RELAY_TEAM_CARDS, note: 'go again' },
  { kind: 'neutral', label: 'bystanders', count: RELAY_NEUTRAL_CARDS, note: 'costs a turn' },
  { kind: 'assassin', label: 'the assassin', count: ASSASSIN_CARDS, note: 'you lose' },
];

function Key({ rows }: { rows: typeof DUEL_KEY }) {
  return (
    <ul className="rules__key">
      {rows.map((r) => (
        <li key={r.kind}>
          <span className={`rules__chip rules__chip--${r.kind}`} aria-hidden="true" />
          <strong>{r.count}</strong>
          <span className="rules__keylabel">{r.label}</span>
          <span className="rules__keynote">{r.note}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the game is and how it is played, on one screen.
 *
 * The counts are read from the engine's constants rather than written out, so
 * the rules cannot quietly drift away from the game they describe.
 */
export function Rules({ mode = 'duel', onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  // Read-and-dismiss, so Escape should do it — nothing here is being edited and
  // there is nothing to lose by leaving.
  //
  // Focus goes to the panel rather than to the dismiss button: on a phone the
  // panel scrolls, and focusing a button at the foot of it scrolls the reader
  // straight past the rules they opened.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const relayFirst = mode === 'relay';

  const duel = (
    <section className="rules__mode" key="duel">
      <h3>Red v Blue</h3>
      <p>
        Two benches race. One is dealt {FIRST_TEAM_CARDS} Members and the other{' '}
        {SECOND_TEAM_CARDS}, and the first bench to have all of theirs turned face up wins.
      </p>
      <Key rows={DUEL_KEY} />
    </section>
  );

  const relay = (
    <section className="rules__mode" key="relay">
      <h3>Violet, two players</h3>
      <p>
        One bench, two players, a turn each. You have {RELAY_TEAM_CARDS} Members to find and{' '}
        {RELAY_TURNS} turns to find them in. There is no opposition, so every card that is not
        yours and not the assassin is a bystander — and every turn that ends costs one off the
        clock. Run out of turns and the bench has lost.
      </p>
      <p className="rules__aside">
        The spymaster gives their clue and sends the guesser their link; the guesser guesses and
        sends it back. Nobody ever sees the other&rsquo;s screen.
      </p>
      <Key rows={RELAY_KEY} />
    </section>
  );

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal__panel modal__panel--rules" ref={panel} tabIndex={-1}>
        <h2>How to play</h2>

        <p className="modal__intro">
          {BOARD_SIZE} Members of the City of London Corporation are dealt face up. Only the
          spymasters know which of them are theirs; everyone else sees {BOARD_SIZE} faces and a
          one-word clue. The aim is to get your own Members named — and to keep well away from
          the one who ends the game on the spot.
        </p>

        <div className="rules__modes">{relayFirst ? [relay, duel] : [duel, relay]}</div>

        <section className="rules__mode">
          <h3>A turn</h3>
          <ol className="rules__steps">
            <li>
              <strong>The spymaster gives a clue</strong> — one word and a number, where the
              number says how many Members on the board the word points at. Nothing else: no
              gestures, no hints about position, and the word may not be a name on the board.
            </li>
            <li>
              <strong>The guesser turns cards over</strong>, one at a time. Each card is
              resolved the moment it is turned, so a wrong one stops the turn there.
            </li>
            <li>
              <strong>They may guess one more than the number</strong> — the customary bonus
              guess, for a Member left over from an earlier clue.
            </li>
            <li>
              <strong>They can stop early</strong> at any point once they have guessed at least
              once, and hand the turn on.
            </li>
          </ol>
          <p className="rules__aside">
            A clue of <strong>0</strong> and an <strong>unlimited</strong> clue both lift the
            cap: guess as long as you keep being right.
          </p>
        </section>

        <div className="modal__actions">
          <span className="modal__spacer" />
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

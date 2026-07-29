import type { Team } from '../game/types';
import { TEAM_NAME } from './Scoreboard';

interface Props {
  team: Team;
  onReady: () => void;
}

/**
 * Sits between turns so play is discrete: the board is covered, the key card is
 * forced hidden, and the incoming spymaster has to acknowledge before the next
 * clue. Without this, one device means the outgoing team can still be looking at
 * the key card when the next turn starts.
 */
export function TurnHandoff({ team, onReady }: Props) {
  return (
    <div className={`handoff handoff--${team}`} role="dialog" aria-modal="true">
      <div className="handoff__panel">
        <span className="handoff__eyebrow">Turn over</span>
        <h2>Pass the screen to the {TEAM_NAME[team]} spymaster</h2>
        <p>The key card stays hidden until they say they are ready.</p>
        <button type="button" className="btn btn--primary" onClick={onReady} autoFocus>
          I’m the {TEAM_NAME[team]} spymaster
        </button>
      </div>
    </div>
  );
}

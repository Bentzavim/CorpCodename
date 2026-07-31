import { useCallback, useState } from 'react';
import type { PublicRoom, Seat } from '../room/types.js';
import { inviteLink } from './useHashRoom.js';

interface Props {
  room: PublicRoom;
}

const DOING: Record<Seat, string> = {
  spymaster: 'give the clue',
  operative: 'make the guesses',
};

/**
 * The baton.
 *
 * On one bench the two players take strict turns — the spymaster clues, then the
 * guesser guesses — and they may be nowhere near each other or each other's
 * clock. So rather than assume both are watching, whoever has just moved is
 * handed the other's link to send on, and whoever is waiting is told what for.
 */
export function Handover({ room }: Props) {
  const [copied, setCopied] = useState(false);
  const game = room.game;

  const waitingOn: Seat | null = !game || game.winner || game.lost
    ? null
    : game.guessesLeft === null
      ? 'spymaster'
      : 'operative';

  const link = inviteLink(room.code, waitingOn ?? undefined);

  const copy = useCallback(() => {
    // Inside a frame the page URL is no use to anyone, so the code is the most
    // that can usefully be handed over.
    const text = window.self === window.top ? link : room.code;
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  }, [link, room.code]);

  if (waitingOn === null) return null;

  const yours = room.you.seat === waitingOn;
  const them = room.players.find((p) => p.seat === waitingOn && p.id !== room.you.id);

  if (yours) {
    return (
      <div className="baton baton--yours">
        <strong>Your move.</strong>
        <span>Time to {DOING[waitingOn]}.</span>
      </div>
    );
  }

  return (
    <div className="baton">
      <div className="baton__word">
        <strong>
          {them ? `${them.name}’s move` : `Waiting for the ${waitingOn}`}
        </strong>
        <span>
          {them?.connected
            ? `They are here — they can ${DOING[waitingOn]} now.`
            : `Send them this link so they can ${DOING[waitingOn]}.`}
        </span>
      </div>
      <button type="button" className="btn btn--primary" onClick={copy}>
        {copied ? 'Copied' : `Copy the ${waitingOn}’s link`}
      </button>
    </div>
  );
}

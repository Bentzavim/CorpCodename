import { useCallback, useEffect, useState } from 'react';
import type { Seat } from '../room/types.js';

function params(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

/**
 * The seat an invite link asks for, if it names one.
 *
 * Two people handing a game back and forth should not each have to find their
 * chair: a link that says which seat it is for claims it on arrival, so the
 * guesser opens their link and is simply the guesser.
 */
export function readWantedSeat(): Seat | null {
  const seat = params().get('seat');
  return seat === 'spymaster' || seat === 'operative' ? seat : null;
}

/** The link to send someone so they land in a particular chair. */
export function inviteLink(code: string, seat?: Seat): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#room=${code}${seat ? `&seat=${seat}` : ''}`;
}

/**
 * The room code lives in the URL hash so an invite link carries it, and so a
 * reload puts you back in the same room.
 */
export function useHashRoom(): [string | null, (code: string | null) => void] {
  const read = () => {
    const code = params().get('room');
    return code ? code.toUpperCase() : null;
  };
  const [code, setCode] = useState<string | null>(read);

  useEffect(() => {
    const onChange = () => setCode(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const set = useCallback((next: string | null) => {
    // The seat is dropped once claimed: it belongs to the invitation, not to
    // the room, and leaving it in would re-claim it on every reload.
    window.history.replaceState(null, '', next ? `#room=${next}` : ' ');
    setCode(next);
  }, []);

  return [code, set];
}

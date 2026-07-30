import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicRoom, RoomAction } from '../room/types';

const PLAYER_KEY = 'corpcodename:player:v1';
const PING_MS = 10_000;

interface Identity {
  id: string;
  name: string;
}

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

function saveIdentity(identity: Identity) {
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(identity));
  } catch {
    // A browser refusing storage costs the player their seat on reload, nothing more.
  }
}

/** Thrown when there is no server behind this copy of the app at all. */
const NO_SERVER =
  'This copy has no server behind it, so online play is not available — ' +
  'open the hosted version instead. Pass-and-play works here.';

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch('/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // A blocked or absent origin — the shared artifact build, typically.
    throw new Error(NO_SERVER);
  }
  // A static host answers /api/room with its own 404 page rather than JSON.
  if (res.status === 404 || res.status === 405) {
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) throw new Error(NO_SERVER);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed.');
  return data;
}

export async function createRoom(name: string): Promise<{ code: string; playerId: string }> {
  const data = await post({ op: 'create', name });
  const room = data.room as PublicRoom;
  const playerId = data.playerId as string;
  saveIdentity({ id: playerId, name });
  return { code: room.code, playerId };
}

export async function joinRoom(code: string, name: string): Promise<string> {
  const known = loadIdentity();
  const data = await post({ op: 'join', code, name, playerId: known?.id });
  const playerId = data.playerId as string;
  saveIdentity({ id: playerId, name });
  return playerId;
}

export type Connection = 'connecting' | 'live' | 'dropped';

export interface RoomChannel {
  room: PublicRoom | null;
  connection: Connection;
  error: string | null;
  /** Refusals from the server — "not your turn" and the like. Clears on the next act. */
  refusal: string | null;
  act: (action: RoomAction) => Promise<void>;
  dismissRefusal: () => void;
}

/**
 * Holds one room open: a Server-Sent Events stream down for state, plain POSTs
 * up for actions.
 *
 * State only ever arrives on the stream, including the state produced by this
 * player's own action. That keeps one authority instead of two and removes any
 * chance of the local copy and the server's disagreeing.
 */
export function useRoom(code: string | null, playerId: string | null): RoomChannel {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const version = useRef(0);

  useEffect(() => {
    if (!code || !playerId) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let backoff = 500;

    const open = () => {
      if (stopped) return;
      source = new EventSource(
        `/api/stream?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}` +
          `&since=${version.current}`,
      );

      source.onopen = () => {
        backoff = 500;
        setConnection('live');
      };

      source.onmessage = (event) => {
        try {
          const next = JSON.parse(event.data) as PublicRoom;
          version.current = next.version;
          setRoom(next);
          setConnection('live');
          setError(null);
        } catch {
          // A malformed frame is not worth tearing the stream down for.
        }
      };

      source.onerror = () => {
        source?.close();
        if (stopped) return;
        setConnection('dropped');
        // The function's lifetime cap closes this stream every minute by design,
        // so a reconnect is routine rather than a failure. Back off anyway, in
        // case the room is genuinely gone.
        retry = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 8000);
      };
    };

    open();
    const ping = setInterval(() => {
      void post({ op: 'ping', code, playerId }).catch(() => {});
    }, PING_MS);

    return () => {
      stopped = true;
      clearInterval(ping);
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [code, playerId]);

  const act = useCallback(
    async (action: RoomAction) => {
      if (!code || !playerId) return;
      setRefusal(null);
      try {
        // The response carries the new room, but the stream delivers it too and
        // is the single source of truth; this await is only for the error.
        await post({ op: 'action', code, playerId, action });
      } catch (err) {
        setRefusal(err instanceof Error ? err.message : 'That did not work.');
      }
    },
    [code, playerId],
  );

  return {
    room,
    connection,
    error,
    refusal,
    act,
    dismissRefusal: useCallback(() => setRefusal(null), []),
  };
}

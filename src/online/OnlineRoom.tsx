import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from '../components/Board.js';
import { ClueBar } from '../components/ClueBar.js';
import { GameLog } from '../components/GameLog.js';
import { Scoreboard, TEAM_NAME } from '../components/Scoreboard.js';
import type { PublicRoom } from '../room/types.js';
import { Lobby } from './Lobby.js';
import { JoinScreen } from './JoinScreen.js';
import { useRoom, createRoom, joinRoom, loadIdentity } from './useRoom.js';
import { Handover } from './Handover.js';
import { inviteLink, readWantedSeat } from './useHashRoom.js';

interface Props {
  code: string | null;
  onLeave: () => void;
  onEnterRoom: (code: string) => void;
}

export function OnlineRoom({ code, onLeave, onEnterRoom }: Props) {
  const [playerId, setPlayerId] = useState<string | null>(() => loadIdentity()?.id ?? null);
  // Read once, at mount: joining rewrites the hash to drop the seat, so by the
  // time the room arrives the invitation is gone from the URL.
  const [wantedSeat] = useState(readWantedSeat);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);

  const { room, connection, refusal, act, dismissRefusal } = useRoom(
    joined ? code : null,
    joined ? playerId : null,
  );

  const enter = useCallback(
    async (name: string, wantedCode: string | null) => {
      setJoining(true);
      setJoinError(null);
      try {
        if (wantedCode) {
          const id = await joinRoom(wantedCode, name);
          setPlayerId(id);
          onEnterRoom(wantedCode);
        } else {
          const made = await createRoom(name);
          setPlayerId(made.playerId);
          onEnterRoom(made.code);
        }
        setJoined(true);
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Could not connect.');
      } finally {
        setJoining(false);
      }
    },
    [onEnterRoom],
  );

  // A reload should put you back in your seat rather than ask again: the room is
  // in the URL and the identity is in localStorage, which is everything rejoining
  // needs. Phones background tabs aggressively, so this is the common path, not
  // an edge case.
  const rejoined = useRef(false);
  useEffect(() => {
    if (rejoined.current || joined || !code) return;
    const known = loadIdentity();
    if (!known?.name) return;
    rejoined.current = true;
    void enter(known.name, code);
  }, [code, joined, enter]);

  // An invite link that names a seat should seat you in it, so a game handed
  // back and forth does not ask each player to find their chair every time.
  const claimed = useRef(false);
  useEffect(() => {
    if (claimed.current || !room) return;
    if (!wantedSeat || room.you.seat !== null || room.game) return;
    const taken = room.players.some(
      (p) => p.id !== room.you.id && p.seat === wantedSeat && p.team !== null,
    );
    claimed.current = true;
    if (taken) return;
    const bench = room.mode === 'relay' ? 'violet' : 'red';
    act({ type: 'sit', team: bench, seat: wantedSeat });
  }, [room, act, wantedSeat]);

  const copyInvite = useCallback(() => {
    if (!room) return;
    const link = inviteLink(room.code);
    void navigator.clipboard?.writeText(window.self === window.top ? link : room.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => setCopied(false),
    );
  }, [room]);

  if (!joined) {
    return (
      <JoinScreen
        code={code}
        busy={joining}
        error={joinError}
        onSubmit={enter}
        onCancel={onLeave}
      />
    );
  }

  if (!room) {
    return (
      <div className="empty">
        <div className="empty__panel">
          <h2>{connection === 'dropped' ? 'Reconnecting…' : 'Joining the room…'}</h2>
          <p>Room {code}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <RoomBanner room={room} connection={connection} onLeave={onLeave} />
      {refusal && (
        <p className="refusal" role="alert" onAnimationEnd={dismissRefusal}>
          {refusal}
        </p>
      )}
      {room.mode === 'relay' && room.game && <Handover room={room} />}
      {room.game ? (
        <PlayingRoom room={room} act={act} />
      ) : (
        <Lobby room={room} act={act} onCopyInvite={copyInvite} copied={copied} />
      )}
    </>
  );
}

function RoomBanner({
  room,
  connection,
  onLeave,
}: {
  room: PublicRoom;
  connection: string;
  onLeave: () => void;
}) {
  const seat = room.you.team
    ? `${TEAM_NAME[room.you.team]} ${room.you.seat}`
    : 'watching';
  return (
    <div className="roombar">
      <span className="roombar__code">Room {room.code}</span>
      <span className={`roombar__seat roombar__seat--${room.you.team ?? 'none'}`}>{seat}</span>
      <span className={`roombar__link roombar__link--${connection}`}>
        {connection === 'live' ? 'connected' : connection === 'dropped' ? 'reconnecting…' : 'connecting…'}
      </span>
      <span className="roombar__count">
        {room.players.filter((p) => p.connected).length} of {room.players.length} here
      </span>
      <button type="button" className="btn btn--ghost" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}

function PlayingRoom({
  room,
  act,
}: {
  room: PublicRoom;
  act: (action: import('../room/types').RoomAction) => void;
}) {
  const game = room.game!;
  const { you } = room;
  const onTurn = you.team === game.turn && !game.winner;
  const canClue = onTurn && you.seat === 'spymaster';
  const canGuess = onTurn && you.seat === 'operative';

  const watching = !you.team
    ? 'You are watching.'
    : you.seat === 'spymaster'
      ? 'Your operatives are guessing.'
      : onTurn
        ? undefined
        : `Waiting for ${TEAM_NAME[game.turn]}.`;

  return (
    <main className="layout">
      <section className="layout__main">
        <Scoreboard game={game} />
        <ClueBar
          game={game}
          canClue={canClue}
          canGuess={canGuess}
          watching={watching}
          onClue={(word, count) => act({ type: 'clue', word, count })}
          onPass={() => act({ type: 'pass' })}
        />
        <Board game={game} canGuess={canGuess} onReveal={(index) => act({ type: 'reveal', index })} />
      </section>

      <aside className="layout__side">
        <div className="panel">
          <h2>Around the table</h2>
          <ul className="roster-list">
            {room.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'is-away'}>
                <span className={`dot dot--${p.team ?? 'none'}`} aria-hidden="true" />
                {p.name}
                <span className="roster-list__seat">
                  {p.team ? `${p.seat}` : 'watching'}
                  {!p.connected && ' · away'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {you.id === room.hostId && game.winner && (
          <button type="button" className="btn btn--primary" onClick={() => act({ type: 'newGame' })}>
            Deal another board
          </button>
        )}

        <div className="panel panel--log">
          <h2>Play so far</h2>
          <GameLog log={game.log} />
        </div>
      </aside>
    </main>
  );
}

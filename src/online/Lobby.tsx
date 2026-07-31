import { useState } from 'react';
import type { PublicRoom, RoomAction, Seat } from '../room/types.js';
import type { Team } from '../game/types.js';
import { TEAM_NAME } from '../components/Scoreboard.js';
import { inviteLink } from './useHashRoom.js';

interface Props {
  room: PublicRoom;
  act: (action: RoomAction) => void;
  onCopyInvite: () => void;
  copied: boolean;
}

const SEATS: { seat: Seat; label: string; note: string }[] = [
  { seat: 'spymaster', label: 'Spymaster', note: 'sees the key card, gives the clues' },
  { seat: 'operative', label: 'Operative', note: 'turns the cards over' },
];

/** One link per chair, so each player opens theirs and is simply seated. */
function SeatLinks({ room }: { room: PublicRoom }) {
  const [copied, setCopied] = useState<Seat | null>(null);
  const copy = (seat: Seat) => {
    const link = inviteLink(room.code, seat);
    void navigator.clipboard
      ?.writeText(window.self === window.top ? link : room.code)
      .then(() => {
        setCopied(seat);
        setTimeout(() => setCopied(null), 2000);
      }, () => setCopied(null));
  };
  return (
    <div className="seatlinks">
      {SEATS.map(({ seat, label }) => (
        <button key={seat} type="button" className="btn" onClick={() => copy(seat)}>
          {copied === seat ? 'Copied' : `Copy the ${label.toLowerCase()}’s link`}
        </button>
      ))}
    </div>
  );
}

export function Lobby({ room, act, onCopyInvite, copied }: Props) {
  const isHost = room.you.id === room.hostId;
  const relay = room.mode === 'relay';
  const teams: Team[] = relay ? ['violet'] : ['red', 'blue'];

  return (
    <div className="lobby">
      <header className="lobby__head">
        <div>
          <span className="lobby__eyebrow">Room</span>
          <strong className="lobby__code">{room.code}</strong>
        </div>
        <button type="button" className="btn" onClick={onCopyInvite}>
          {copied ? 'Copied' : 'Copy invite link'}
        </button>
      </header>

      <p className="lobby__intro">
        {relay
          ? 'Two players, one bench, a turn each. The spymaster gives a clue and sends the guesser their link; the guesser guesses and sends it back.'
          : 'Share the link. Everyone picks a seat — each bench needs one spymaster and at least one operative.'}
      </p>

      {relay && <SeatLinks room={room} />}

      {isHost ? (
        <div className="lobby__mode">
          <span className="lobby__eyebrow">Benches</span>
          <div className="join__mode">
            <button
              type="button"
              className={`btn ${!relay ? 'btn--primary' : ''}`}
              onClick={() => act({ type: 'mode', mode: 'duel' })}
              aria-pressed={!relay}
            >
              Red v Blue
            </button>
            <button
              type="button"
              className={`btn ${relay ? 'btn--primary' : ''}`}
              onClick={() => act({ type: 'mode', mode: 'relay' })}
              aria-pressed={relay}
            >
              Violet, two players
            </button>
          </div>
          <p className="lobby__blocker">
            {relay
              ? 'One bench, two players, turn by turn: nine Members to find in nine turns, and every card but those and the assassin costs a turn.'
              : 'Two benches, nine cards and eight, first to find their own.'}
          </p>
        </div>
      ) : (
        <p className="lobby__blocker">
          {relay ? 'Violet Bench — two players, a turn each.' : 'Red against Blue.'}
        </p>
      )}

      <div className={`lobby__teams ${relay ? 'lobby__teams--relay' : ''}`}>
        {teams.map((team) => (
          <section key={team} className={`lobby__team lobby__team--${team}`}>
            <h2>{TEAM_NAME[team]}</h2>
            {SEATS.map(({ seat, label, note }) => {
              const sitting = room.players.filter((p) => p.team === team && p.seat === seat);
              const isMine = room.you.team === team && room.you.seat === seat;
              return (
                <div key={seat} className="lobby__seat">
                  <button
                    type="button"
                    className={`btn btn--seat ${isMine ? 'is-mine' : ''}`}
                    onClick={() => act({ type: 'sit', team, seat })}
                    aria-pressed={isMine}
                  >
                    {label}
                    <span className="btn__note">{note}</span>
                  </button>
                  <ul className="lobby__who">
                    {sitting.map((p) => (
                      <li key={p.id} className={p.connected ? '' : 'is-away'}>
                        {p.name}
                        {p.id === room.hostId && <span className="lobby__host"> host</span>}
                        {!p.connected && <span className="lobby__away"> away</span>}
                      </li>
                    ))}
                    {sitting.length === 0 && <li className="is-empty">empty</li>}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <section className="lobby__bench">
        <h2>Not playing</h2>
        <ul className="lobby__who">
          {room.players.filter((p) => p.team === null).map((p) => (
            <li key={p.id} className={p.connected ? '' : 'is-away'}>
              {p.name}
              {p.id === room.hostId && <span className="lobby__host"> host</span>}
            </li>
          ))}
          {room.players.every((p) => p.team !== null) && <li className="is-empty">nobody</li>}
        </ul>
        {room.you.team !== null && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => act({ type: 'sit', team: null, seat: null })}
          >
            Stand down
          </button>
        )}
      </section>

      <footer className="lobby__foot">
        {isHost ? (
          <>
            <button
              type="button"
              className="btn btn--primary"
              disabled={room.blocker !== null}
              onClick={() => act({ type: 'start' })}
            >
              Deal the board
            </button>
            {room.blocker && <span className="lobby__blocker">{room.blocker}</span>}
          </>
        ) : (
          <span className="lobby__blocker">
            {room.blocker ?? 'Ready — waiting for the host to deal.'}
          </span>
        )}
      </footer>
    </div>
  );
}

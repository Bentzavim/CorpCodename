import type { PublicRoom, RoomAction, Seat } from '../room/types';
import type { Team } from '../game/types';
import { TEAM_NAME } from '../components/Scoreboard';

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

export function Lobby({ room, act, onCopyInvite, copied }: Props) {
  const isHost = room.you.id === room.hostId;
  const teams: Team[] = ['red', 'blue'];

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
        Share the link. Everyone picks a bench and a seat — each bench needs one spymaster
        and at least one operative.
      </p>

      <div className="lobby__teams">
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

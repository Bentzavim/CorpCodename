import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from './components/Board.js';
import { ClueBar } from './components/ClueBar.js';
import { GameLog } from './components/GameLog.js';
import { RosterImport } from './components/RosterImport.js';
import { Scoreboard } from './components/Scoreboard.js';
import { TurnHandoff } from './components/TurnHandoff.js';
import { membersToEntities, type MemberRecord } from './data/members.js';
import { loadRoster } from './data/rosterStorage.js';
import { ROSTER_FETCHED_AT, ROSTER_SOURCE } from './data/roster.js';
import { createGame, giveClue, pass, revealCard } from './game/engine.js';
import { localPublicGame } from './room/local.js';
import { OnlineRoom } from './online/OnlineRoom.js';
import { useHashRoom } from './online/useHashRoom.js';
import { normaliseSeed, randomSeed } from './game/rng.js';
import { BOARD_SIZE, type GameMode, type GameState } from './game/types.js';

function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

function readSeed(): string {
  return normaliseSeed(hashParams().get('seed') ?? '') || randomSeed();
}

function readMode(): GameMode {
  return hashParams().get('mode') === 'solo' ? 'solo' : 'duel';
}

export default function App() {
  const [roomCode, setRoomCode] = useHashRoom();
  const [wantOnline, setWantOnline] = useState(false);

  if (roomCode !== null || wantOnline) {
    return (
      <div className="app">
        <Brand />
        <OnlineRoom
          code={roomCode}
          onEnterRoom={setRoomCode}
          onLeave={() => {
            setRoomCode(null);
            setWantOnline(false);
          }}
        />
      </div>
    );
  }

  return <LocalGame onGoOnline={() => setWantOnline(true)} />;
}

function Brand() {
  return (
    <header className="topbar topbar--slim">
      <div className="topbar__brand">
        <h1>Corp Codenames</h1>
        <p>Members of the City of London Corporation</p>
      </div>
    </header>
  );
}

function LocalGame({ onGoOnline }: { onGoOnline: () => void }) {
  // Held in state rather than derived: the roster is read from localStorage, so
  // it has to be rebuilt explicitly after an import.
  const [roster, setRoster] = useState<MemberRecord[]>(loadRoster);
  const entities = useMemo(() => membersToEntities(roster), [roster]);
  const playable = entities.length >= BOARD_SIZE;

  const [seed, setSeed] = useState<string>(readSeed);
  const [mode, setMode] = useState<GameMode>(readMode);
  const [game, setGame] = useState<GameState | null>(null);
  const [spymaster, setSpymaster] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Which turn the handoff screen has been dismissed for, e.g. "blue:2". */
  const [readyFor, setReadyFor] = useState<string | null>(null);

  // A turn is identified by whose it is plus how many clues have been given, so
  // each new turn needs its own acknowledgement.
  const turnKey = game ? `${game.turn}:${game.clues.length}` : '';
  const needsHandoff =
    game !== null &&
    game.winner === null &&
    !game.lost &&
    game.guessesLeft === null && // between turns, before the next clue
    game.log.length > 0 && // the opening turn needs no handoff
    readyFor !== turnKey;

  // One view type for both modes: here the spymaster toggle decides what the
  // cards carry, exactly where the server's role check decides it online.
  const view = game ? localPublicGame(game, spymaster && !needsHandoff) : null;

  // Rebuild the board whenever the seed or the roster changes. The same seed and
  // roster always yield the same board, which is what makes links shareable.
  useEffect(() => {
    if (!playable) {
      setGame(null);
      return;
    }
    setGame(createGame(seed, 'members', entities, mode));
    setSpymaster(false);
    setReadyFor(null);
  }, [seed, entities, playable, mode]);

  useEffect(() => {
    const hash = mode === 'solo' ? `#seed=${seed}&mode=solo` : `#seed=${seed}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [seed, mode]);

  // Someone pasting a shared link into the address bar only changes the hash.
  useEffect(() => {
    const onHashChange = () => {
      setSeed((prev) => (prev === readSeed() ? prev : readSeed()));
      setMode((prev) => (prev === readMode() ? prev : readMode()));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Embedded in a frame, window.location is the frame's own URL rather than the
  // page someone could open, so the seed itself is the only thing worth copying.
  const framed = typeof window !== 'undefined' && window.self !== window.top;

  const shareLink = useCallback(() => {
    const { origin, pathname } = window.location;
    const suffix = mode === 'solo' ? '&mode=solo' : '';
    const text = framed ? seed : `${origin}${pathname}#seed=${seed}${suffix}`;
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => setCopied(false),
    );
  }, [seed, framed, mode]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <h1>Corp Codenames</h1>
          <p>Members of the City of London Corporation</p>
        </div>

        {playable && (
          <div className="topbar__controls">
            <label className="field">
              <span>Seed</span>
              <input
                className="field__seed"
                value={seed}
                onChange={(e) => setSeed(normaliseSeed(e.target.value))}
                spellCheck={false}
                aria-label="Game seed — the same seed gives the same board"
              />
            </label>

            <button
              type="button"
              className="btn"
              onClick={shareLink}
              title={
                framed
                  ? 'Copy the seed — type it in on another device for the same board'
                  : 'Copy a link that opens this exact board'
              }
            >
              {copied ? 'Copied' : framed ? 'Copy seed' : 'Share'}
            </button>
            <label className="field">
              <span>Benches</span>
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as GameMode);
                  setSeed(randomSeed());
                }}
                aria-label="How many benches are playing"
              >
                <option value="duel">Red v Blue</option>
                <option value="solo">Violet, alone</option>
              </select>
            </label>

            <button type="button" className="btn btn--primary" onClick={() => setSeed(randomSeed())}>
              New game
            </button>
            <button
              type="button"
              className="btn"
              onClick={onGoOnline}
              title="Everyone on their own screen, with the key card kept on the server"
            >
              Play online
            </button>
          </div>
        )}
      </header>

      {!playable ? (
        <main className="empty">
          <div className="empty__panel">
            <h2>Load the Members roster to play</h2>
            <p>
              A board is {BOARD_SIZE} cards and the roster currently holds{' '}
              <strong>{roster.length}</strong>. The full Court of Common Council — 25 Aldermen
              and 100 Common Councillors — is published on the Corporation’s democracy portal,
              but it could not be reached when this build was made, and inventing names for
              real officeholders was not an option.
            </p>
            <p>Two ways to fill it:</p>
            <ul>
              <li>
                <strong>Paste it in</strong> — copy the member index page and use the importer
                below. Stored in this browser.
              </li>
              <li>
                <strong>Bake it in</strong> — run <code>npm run scrape:members</code> from a
                machine that can reach the portal, then rebuild.
              </li>
            </ul>
            <div className="empty__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowImport(true)}
              >
                Import roster
              </button>
            </div>
          </div>
        </main>
      ) : (
        game && view && (
          <main className="layout">
            <section className="layout__main">
              <Scoreboard game={view} />
              <ClueBar
                game={view}
                onClue={(word, count) => setGame((g) => (g ? giveClue(g, word, count) : g))}
                onPass={() => setGame((g) => (g ? pass(g) : g))}
              />
              <Board
                game={view}
                onReveal={(i) => setGame((g) => (g ? revealCard(g, i) : g))}
              />
            </section>

            <aside className="layout__side">
              <button
                type="button"
                className={`spytoggle ${spymaster && !needsHandoff ? 'is-on' : ''}`}
                onClick={() => setSpymaster((s) => !s)}
                aria-pressed={spymaster && !needsHandoff}
                disabled={needsHandoff}
              >
                <span className="spytoggle__title">
                  {spymaster && !needsHandoff ? 'Spymaster view on' : 'Spymaster view'}
                </span>
                <span className="spytoggle__note">
                  {needsHandoff
                    ? 'Locked until the handoff'
                    : spymaster
                      ? 'Hide this before passing the screen'
                      : 'Reveals the key card'}
                </span>
              </button>

              <div className="panel">
                <h2>Roster</h2>
                <p className="panel__note">
                  {roster.length} Members — {BOARD_SIZE} dealt each game.
                </p>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowImport(true)}
                >
                  Import roster
                </button>
              </div>

              <div className="panel panel--log">
                <h2>Play so far</h2>
                <GameLog log={game.log} />
              </div>
            </aside>
          </main>
        )
      )}

      {game && needsHandoff && !showImport && (
        <TurnHandoff
          team={game.turn}
          onReady={() => {
            setSpymaster(false);
            setReadyFor(turnKey);
          }}
        />
      )}

      {showImport && (
        <RosterImport
          currentCount={roster.length}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            setRoster(loadRoster());
            setSeed(randomSeed());
          }}
        />
      )}

      <footer className="colophon">
        <p>
          Names and portraits come from the City of London Corporation&rsquo;s{' '}
          <a href={ROSTER_SOURCE} target="_blank" rel="noreferrer">
            public register of Members
          </a>
          {ROSTER_FETCHED_AT && <> as it stood on {ROSTER_FETCHED_AT}</>}. An unofficial
          game, not affiliated with or endorsed by the Corporation.
        </p>
        <p>
          Codenames is a game by Vlaada Chv&aacute;til, published by Czech Games Edition.
          This is an unofficial take on the mechanics with a different card set.
        </p>
      </footer>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from './components/Board';
import { ClueBar } from './components/ClueBar';
import { GameLog } from './components/GameLog';
import { RosterImport } from './components/RosterImport';
import { Scoreboard } from './components/Scoreboard';
import { TurnHandoff } from './components/TurnHandoff';
import { loadRoster, membersToEntities, type MemberRecord } from './data/members';
import { createGame, giveClue, pass, revealCard } from './game/engine';
import { normaliseSeed, randomSeed } from './game/rng';
import { BOARD_SIZE, type GameState } from './game/types';

function readSeed(): string {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return normaliseSeed(params.get('seed') ?? '') || randomSeed();
}

export default function App() {
  // Held in state rather than derived: the roster is read from localStorage, so
  // it has to be rebuilt explicitly after an import.
  const [roster, setRoster] = useState<MemberRecord[]>(loadRoster);
  const entities = useMemo(() => membersToEntities(roster), [roster]);
  const playable = entities.length >= BOARD_SIZE;

  const [seed, setSeed] = useState<string>(readSeed);
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
    game.guessesLeft === null && // between turns, before the next clue
    game.log.length > 0 && // the opening turn needs no handoff
    readyFor !== turnKey;

  // Rebuild the board whenever the seed or the roster changes. The same seed and
  // roster always yield the same board, which is what makes links shareable.
  useEffect(() => {
    if (!playable) {
      setGame(null);
      return;
    }
    setGame(createGame(seed, 'members', entities));
    setSpymaster(false);
    setReadyFor(null);
  }, [seed, entities, playable]);

  useEffect(() => {
    const hash = `#seed=${seed}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [seed]);

  // Someone pasting a shared link into the address bar only changes the hash.
  useEffect(() => {
    const onHashChange = () => setSeed((prev) => (prev === readSeed() ? prev : readSeed()));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const shareLink = useCallback(() => {
    const { origin, pathname } = window.location;
    void navigator.clipboard?.writeText(`${origin}${pathname}#seed=${seed}`).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => setCopied(false),
    );
  }, [seed]);

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

            <button type="button" className="btn" onClick={shareLink}>
              {copied ? 'Copied' : 'Share'}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setSeed(randomSeed())}>
              New game
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
        game && (
          <main className="layout">
            <section className="layout__main">
              <Scoreboard game={game} />
              <ClueBar
                game={game}
                onClue={(word, count) => setGame((g) => (g ? giveClue(g, word, count) : g))}
                onPass={() => setGame((g) => (g ? pass(g) : g))}
              />
              <Board
                game={game}
                // The key card must not survive the handoff to the next team.
                spymaster={spymaster && !needsHandoff}
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
    </div>
  );
}

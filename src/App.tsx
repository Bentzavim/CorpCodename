import { useCallback, useEffect, useState } from 'react';
import { Board } from './components/Board';
import { ClueBar } from './components/ClueBar';
import { GameLog } from './components/GameLog';
import { RosterImport } from './components/RosterImport';
import { Scoreboard } from './components/Scoreboard';
import { buildDecks, defaultDeckId, isPlayable, MEMBERS_DECK_ID, WARDS_DECK_ID } from './data/decks';
import { createGame, giveClue, pass, revealCard } from './game/engine';
import { normaliseSeed, randomSeed } from './game/rng';
import { BOARD_SIZE, type Deck, type GameState } from './game/types';

interface Config {
  deckId: string;
  seed: string;
}

function readHash(decks: Deck[]): Config {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const deckId = params.get('deck');
  const seed = normaliseSeed(params.get('seed') ?? '');
  return {
    deckId: decks.some((d) => d.id === deckId) ? deckId! : defaultDeckId(decks),
    seed: seed || randomSeed(),
  };
}

export default function App() {
  // Held in state rather than derived: the Members deck is read from
  // localStorage, so it has to be rebuilt explicitly after an import.
  const [decks, setDecks] = useState<Deck[]>(buildDecks);

  const [config, setConfig] = useState<Config>(() => readHash(decks));
  const [game, setGame] = useState<GameState | null>(null);
  const [spymaster, setSpymaster] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [copied, setCopied] = useState(false);

  const deck = decks.find((d) => d.id === config.deckId) ?? decks[0];
  const playable = isPlayable(deck);

  // Rebuild the board whenever the seed or the deck changes. Same seed + same
  // deck always yields the same board, which is what makes links shareable.
  useEffect(() => {
    if (!playable) {
      setGame(null);
      return;
    }
    setGame(createGame(config.seed, deck.id, deck.entities));
    setSpymaster(false);
  }, [config.seed, deck, playable]);

  useEffect(() => {
    const hash = `#deck=${config.deckId}&seed=${config.seed}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }, [config]);

  // Someone pasting a shared link into the address bar only changes the hash.
  useEffect(() => {
    const onHashChange = () => {
      const next = readHash(decks);
      setConfig((prev) =>
        prev.deckId === next.deckId && prev.seed === next.seed ? prev : next,
      );
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [decks]);

  const newGame = useCallback(() => {
    setConfig((prev) => ({ ...prev, seed: randomSeed() }));
  }, []);

  const shareLink = useCallback(() => {
    const { origin, pathname } = window.location;
    const url = `${origin}${pathname}#deck=${config.deckId}&seed=${config.seed}`;
    void navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => setCopied(false),
    );
  }, [config]);

  const membersDeck = decks.find((d) => d.id === MEMBERS_DECK_ID);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <h1>Corp Codenames</h1>
          <p>Members of the City of London Corporation</p>
        </div>

        <div className="topbar__controls">
          <label className="field">
            <span>Deck</span>
            <select
              value={config.deckId}
              onChange={(e) => setConfig((prev) => ({ ...prev, deckId: e.target.value }))}
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} ({d.entities.length})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Seed</span>
            <input
              className="field__seed"
              value={config.seed}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, seed: normaliseSeed(e.target.value) }))
              }
              spellCheck={false}
              aria-label="Game seed — the same seed gives the same board"
            />
          </label>

          <button type="button" className="btn" onClick={shareLink}>
            {copied ? 'Copied' : 'Share'}
          </button>
          <button type="button" className="btn btn--primary" onClick={newGame}>
            New game
          </button>
        </div>
      </header>

      {!playable ? (
        <main className="empty">
          <div className="empty__panel">
            <h2>
              The {deck.label} deck needs {BOARD_SIZE} cards
            </h2>
            <p>
              It currently holds <strong>{deck.entities.length}</strong>. The full Court of
              Common Council — 25 Aldermen and 100 Common Councillors — is published on the
              Corporation’s democracy portal, but it could not be reached when this build was
              made, and inventing names for real officeholders was not an option.
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
              <button
                type="button"
                className="btn"
                onClick={() => setConfig((prev) => ({ ...prev, deckId: WARDS_DECK_ID }))}
              >
                Play the 25 Wards instead
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
                spymaster={spymaster}
                onReveal={(i) => setGame((g) => (g ? revealCard(g, i) : g))}
              />
            </section>

            <aside className="layout__side">
              <button
                type="button"
                className={`spytoggle ${spymaster ? 'is-on' : ''}`}
                onClick={() => setSpymaster((s) => !s)}
                aria-pressed={spymaster}
              >
                <span className="spytoggle__title">
                  {spymaster ? 'Spymaster view on' : 'Spymaster view'}
                </span>
                <span className="spytoggle__note">
                  {spymaster ? 'Hide this before passing the screen' : 'Reveals the key card'}
                </span>
              </button>

              <div className="panel">
                <h2>Deck</h2>
                <p className="panel__note">{deck.description}</p>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowImport(true)}
                >
                  Import roster
                  {membersDeck ? ` (${membersDeck.entities.length} members)` : ''}
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

      {showImport && (
        <RosterImport
          currentCount={membersDeck?.entities.length ?? 0}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            setDecks(buildDecks());
            setConfig((prev) => ({ ...prev, deckId: MEMBERS_DECK_ID, seed: randomSeed() }));
          }}
        />
      )}
    </div>
  );
}

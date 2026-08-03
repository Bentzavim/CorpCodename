import { useState } from 'react';
import { normaliseSeed } from '../game/rng.js';
import type { GameMode } from '../game/types.js';
import { loadIdentity } from './useRoom.js';

interface Props {
  /** Prefilled from an invite link, when there is one. */
  code: string | null;
  /** The game a room made from here will be. */
  mode?: GameMode;
  /** Which way round to open when there is no invite link to follow. */
  intent?: 'create' | 'join';
  busy: boolean;
  error: string | null;
  onSubmit: (name: string, code: string | null) => void;
  onCancel: () => void;
}

export function JoinScreen({
  code,
  mode = 'duel',
  intent = 'join',
  busy,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(() => loadIdentity()?.name ?? '');
  const [typedCode, setTypedCode] = useState(code ?? '');
  const invited = code !== null;
  const [joining, setJoining] = useState(invited || intent === 'join');
  // Creating a room needs only a name; joining needs a code as well.
  const needsCode = joining && !invited;
  const ready = name.trim() !== '' && (!needsCode || typedCode.trim().length > 0);

  return (
    <div className="empty">
      <form
        className="empty__panel join"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          onSubmit(name.trim(), joining ? normaliseSeed(typedCode) : null);
        }}
      >
        <h2>
          {invited
            ? `Join room ${code}`
            : joining
              ? 'Join a room'
              : mode === 'relay'
                ? 'Start a two-player game'
                : 'Start a Red v Blue room'}
        </h2>
        <p>
          {!invited && !joining && mode === 'relay'
            ? 'You and one other, a turn each. You will get a link for the spymaster and a link for the guesser to send between you.'
            : 'Everyone gets their own screen. Spymasters see the key card; operatives see only what has been turned over.'}
        </p>

        <label className="field field--wide">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex"
            maxLength={24}
            autoFocus
          />
        </label>

        {!invited && (
          <div className="join__mode">
            <button
              type="button"
              className={`btn ${!joining ? 'btn--primary' : ''}`}
              onClick={() => setJoining(false)}
              aria-pressed={!joining}
            >
              Start a room
            </button>
            <button
              type="button"
              className={`btn ${joining ? 'btn--primary' : ''}`}
              onClick={() => setJoining(true)}
              aria-pressed={joining}
            >
              Join with a code
            </button>
          </div>
        )}

        {joining && !invited && (
          <label className="field field--wide">
            <span>Room code</span>
            <input
              className="field__seed"
              value={typedCode}
              onChange={(e) => setTypedCode(normaliseSeed(e.target.value).slice(0, 4))}
              placeholder="ABCD"
            />
          </label>
        )}

        {error && (
          <p className="join__error" role="alert">
            {error}
          </p>
        )}

        <div className="empty__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Back
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !ready}>
            {busy ? 'Connecting…' : invited || joining ? 'Join' : 'Create room'}
          </button>
        </div>
      </form>
    </div>
  );
}

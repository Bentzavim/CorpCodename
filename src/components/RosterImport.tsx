import { useMemo, useState } from 'react';
import { BOARD_SIZE } from '../game/types.js';
import { displayName, parseRoster, type MemberRecord } from '../data/members.js';
import { clearRoster, hasImportedRoster, saveRoster } from '../data/rosterStorage.js';
import { ROSTER_SOURCE } from '../data/roster.js';

interface Props {
  currentCount: number;
  onClose: () => void;
  onImported: () => void;
}

export function RosterImport({ currentCount, onClose, onImported }: Props) {
  const [text, setText] = useState('');
  const parsed: MemberRecord[] = useMemo(() => parseRoster(text), [text]);
  const enough = parsed.length >= BOARD_SIZE;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Import roster">
      <div className="modal__panel">
        <h2>Import the Members roster</h2>
        <p className="modal__intro">
          The roster holds <strong>{currentCount}</strong>{' '}
          {currentCount === 1 ? 'name' : 'names'}; a board needs {BOARD_SIZE}. To replace it,
          open{' '}
          <a href={ROSTER_SOURCE} target="_blank" rel="noreferrer">
            the City of London member index
          </a>
          , select the list of members, copy it, and paste it below. Names and wards are
          picked out automatically, and the result is kept in this browser only.
        </p>

        <textarea
          className="modal__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            'Paste here, e.g.\n\nAlderman Tijs Broeke\tCheap\nSimon Burrows\tBishopsgate\n…'
          }
          spellCheck={false}
        />

        <p className={`modal__status ${enough ? 'is-ok' : text ? 'is-warn' : ''}`}>
          {text
            ? `${parsed.length} members recognised${
                enough ? '' : ` — ${BOARD_SIZE - parsed.length} short of a full board`
              }`
            : 'Nothing pasted yet.'}
        </p>

        {parsed.length > 0 && (
          <ul className="modal__preview">
            {parsed.slice(0, 6).map((m) => (
              <li key={m.name}>
                {displayName(m.name)}
                {m.ward && <span> · {m.ward}</span>}
              </li>
            ))}
            {parsed.length > 6 && <li className="is-muted">…and {parsed.length - 6} more</li>}
          </ul>
        )}

        <div className="modal__actions">
          {hasImportedRoster() && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                clearRoster();
                onImported();
              }}
            >
              Reset to built-in
            </button>
          )}
          <span className="modal__spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={parsed.length === 0}
            onClick={() => {
              saveRoster(parsed);
              onImported();
            }}
          >
            Save {parsed.length > 0 ? `${parsed.length} members` : 'roster'}
          </button>
        </div>
      </div>
    </div>
  );
}

import type { LogEntry } from '../game/types';
import { TEAM_NAME } from './Scoreboard';

const RESULT_TEXT: Record<string, string> = {
  red: 'a Red card',
  blue: 'a Blue card',
  neutral: 'a bystander',
  assassin: 'the assassin',
};

function describe(entry: LogEntry): string {
  switch (entry.kind) {
    case 'clue':
      return `${TEAM_NAME[entry.team]} clue: “${entry.word}” for ${entry.count}`;
    case 'reveal':
      return `${TEAM_NAME[entry.team]} turned over ${entry.name} — ${RESULT_TEXT[entry.result]}`;
    case 'pass':
      return `${TEAM_NAME[entry.team]} ended their turn`;
    case 'end':
      return `${TEAM_NAME[entry.winner]} win — ${entry.reason}`;
  }
}

export function GameLog({ log }: { log: LogEntry[] }) {
  if (log.length === 0) {
    return <p className="log__empty">The spymaster goes first. Give a clue to begin.</p>;
  }

  return (
    <ol className="log">
      {log
        .map((entry, i) => (
          <li key={i} className={`log__item log__item--${entry.kind}`}>
            {describe(entry)}
          </li>
        ))
        .reverse()}
    </ol>
  );
}

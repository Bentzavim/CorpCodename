import type { BoardCard } from '../game/types';
import { Avatar } from './Avatar';

interface Props {
  card: BoardCard;
  index: number;
  spymaster: boolean;
  disabled: boolean;
  onReveal: (index: number) => void;
}

const KIND_LABEL: Record<BoardCard['kind'], string> = {
  red: 'Red',
  blue: 'Blue',
  neutral: 'Bystander',
  assassin: 'Assassin',
};

export function Card({ card, index, spymaster, disabled, onReveal }: Props) {
  const { entity, kind, revealed } = card;
  // The key card is visible to the spymaster, and to everyone once turned over.
  const showKind = revealed || spymaster;

  const classes = [
    'card',
    revealed && 'card--revealed',
    spymaster && !revealed && 'card--peek',
    showKind && `card--${kind}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || revealed}
      onClick={() => onReveal(index)}
      aria-label={
        revealed
          ? `${entity.name} — already turned over, ${KIND_LABEL[kind]}`
          : `Turn over ${entity.name}${entity.subtitle ? `, ${entity.subtitle}` : ''}`
      }
    >
      <Avatar entity={entity} />
      <span className="card__name">{entity.name}</span>
      {entity.subtitle && <span className="card__subtitle">{entity.subtitle}</span>}
      {showKind && <span className="card__kind">{KIND_LABEL[kind]}</span>}
    </button>
  );
}

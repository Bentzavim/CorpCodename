import type { CardKind } from '../game/types.js';
import type { PublicCard } from '../room/types.js';
import { Avatar } from './Avatar.js';

interface Props {
  card: PublicCard;
  index: number;
  disabled: boolean;
  onReveal: (index: number) => void;
}

const KIND_LABEL: Record<CardKind, string> = {
  red: 'Red',
  blue: 'Blue',
  neutral: 'Bystander',
  assassin: 'Assassin',
};

export function Card({ card, index, disabled, onReveal }: Props) {
  const { entity, kind, revealed } = card;
  // `kind` is null whenever the viewer is not allowed to know it, so there is
  // nothing here to decide: if it arrived, it may be shown.
  const showKind = kind !== null;

  const classes = [
    'card',
    revealed && 'card--revealed',
    showKind && !revealed && 'card--peek',
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
        revealed && kind
          ? `${entity.name} — already turned over, ${KIND_LABEL[kind]}`
          : `Turn over ${entity.name}`
      }
    >
      <Avatar entity={entity} />
      <span className="card__name">{entity.name}</span>
      {kind && <span className="card__kind">{KIND_LABEL[kind]}</span>}
    </button>
  );
}

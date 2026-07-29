import { useState } from 'react';
import type { Entity } from '../game/types';

/** Stable 32-bit hash so an entity always gets the same generated crest. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function initials(name: string): string {
  const words = name
    .replace(/\b(sir|dame|lord|lady|the|of|and)\b/gi, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({ entity }: { entity: Entity }) {
  const [failed, setFailed] = useState(false);

  if (entity.photo && !failed) {
    return (
      <img
        className="avatar avatar--photo"
        src={entity.photo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  // Two hues a fixed distance apart give a coat-of-arms feel without clashing.
  const h = hash(entity.id || entity.name);
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;

  return (
    <span
      className="avatar avatar--crest"
      aria-hidden="true"
      style={{
        background: `linear-gradient(150deg, hsl(${hue} 46% 42%), hsl(${hue2} 52% 26%))`,
      }}
    >
      {initials(entity.name)}
    </span>
  );
}

import type { Entity } from '../game/types';
import { ROSTER } from './roster';
import { matchWard } from './wards';

export type MemberRole = 'Alderman' | 'Alderwoman' | 'Common Councillor';

export interface MemberRecord {
  /**
   * The name exactly as the member index prints it, honours and office and all
   * — e.g. "Sir Alastair John Naisbitt King DL (Alderman)". Cards show
   * `displayName(name)`; the full string is kept so the record stays faithful to
   * the source.
   */
  name: string;
  ward?: string;
  role?: MemberRole;
  /** Official portrait URL, filled in by the scraper. */
  photo?: string;
}

/**
 * The roster baked into the build, replaced wholesale by
 * `npm run scrape:members`. See src/data/roster.ts. A roster imported in the
 * browser takes precedence — see ./rosterStorage.ts, which is browser-only and
 * deliberately kept out of this module so the server can import it.
 */
export const SEED_MEMBERS: MemberRecord[] = ROSTER;

/**
 * Deliberately free of anything browser-only: the server builds boards from the
 * same roster, so this has to run under Node too. Portrait paths stay as stored
 * and are resolved where they are rendered — see resolvePhotoUrl.
 */
export function membersToEntities(records: MemberRecord[]): Entity[] {
  return records.map((m, i) => ({
    id: `member:${slug(m.name)}:${i}`,
    name: displayName(m.name),
    photo: m.photo,
  }));
}

/** Offices, which belong to the record rather than to the name on the card. */
const OFFICE =
  /\b(alderwoman|alderman|deputy|sheriff|chief\s+commoner|councillor|councilman|councilwoman|cllr\.?)\b/gi;

/**
 * Post-nominals, as an explicit list rather than an all-caps pattern: initials
 * and names like "St John" would otherwise be stripped too.
 */
const POST_NOMINAL =
  /\b(KC|QC|MBE|OBE|CBE|DBE|KBE|GBE|BEM|JP|DL|TD|VR|VO|CVO|KCVO|DSO|MC)\b/g;

/**
 * Honorifics and offices, stripped only from the front of a name. "Lord",
 * "King" and "Mayor" are all surnames in this roster, so removing these
 * anywhere would eat real names.
 */
const LEADING_TITLE =
  /^(the|rt\.?|right|hon\.?|honourable|lady|lord|mayor|sir|dame|professor|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|miss)\s+/i;

/** The only titles that stay on the card. */
const KEPT_TITLE: [RegExp, string][] = [
  [/\bdame\b/i, 'Dame'],
  [/\bsir\b/i, 'Sir'],
  [/\b(hon\.?|honourable)\b/i, 'Hon.'],
];

/** Surname particles that belong with the word after them. */
const PARTICLE =
  /^(van|von|de|del|della|di|da|dos|du|la|le|el|al|ten|ter|bin|ibn|abu|mac|mc|st\.?|saint)$/i;

/**
 * The name as it goes on a card: a title only if it is Sir, Dame or Hon., then
 * the first name and the surname. Middle names, offices and post-nominals all
 * come off, so 25 of these can be read at a glance on a board.
 */
export function displayName(raw: string): string {
  const stripped = raw
    .replace(/\([^)]*\)/g, ' ') // "(Alderman)", "(Alderman & Sheriff)"
    .replace(POST_NOMINAL, ' ')
    .replace(OFFICE, ' ')
    .replace(/[,&]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const title = KEPT_TITLE.find(([pattern]) => pattern.test(stripped))?.[1] ?? '';

  let rest = stripped;
  while (LEADING_TITLE.test(rest)) rest = rest.replace(LEADING_TITLE, '');

  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length === 0) return stripped;

  // Walk back over any particles so "de Vere" stays whole.
  let start = words.length - 1;
  while (start > 1 && PARTICLE.test(words[start - 1])) start -= 1;
  const surname = words.slice(start).join(' ');
  const forename = words.length > 1 ? words[0] : '';

  return [title, forename, surname].filter(Boolean).join(' ');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Roster import
//
// Parses text pasted straight off the democracy portal. The page can be copied
// in a few different shapes (table view, list view, per-ward view), so the
// parser is deliberately tolerant: it anchors on the 25 known ward names and
// works outwards, rather than assuming a fixed column order.
// ---------------------------------------------------------------------------

const NOISE = new RegExp(
  [
    '^(your councillors|councillors|search|filter|home|skip to|back to top)',
    '^(name|ward|party|role|title|contact|address|telephone|email|photo)$',
    '^(a|an|the)$',
    '^(view|show|sort|print|rss|share|help)\\b',
    '^\\(?\\+?\\d[\\d\\s()-]{6,}$', // phone numbers
  ].join('|'),
  'i',
);

const TITLE_PATTERN =
  /^(the\s+rt\s+hon\.?\s+|the\s+right\s+honourable\s+|alderwoman\s+|alderman\s+|deputy\s+|sheriff\s+|sir\s+|dame\s+|lord\s+|lady\s+|mr\.?\s+|mrs\.?\s+|miss\s+|ms\.?\s+|dr\.?\s+|prof(?:essor)?\.?\s+|cllr\.?\s+|councillor\s+|councilman\s+|councilwoman\s+)+/i;

function isNoise(line: string): boolean {
  if (line.length < 2 || line.length > 80) return true;
  if (NOISE.test(line)) return true;
  if (line.includes('@') || /https?:\/\//i.test(line)) return true;
  if (!/[a-z]/i.test(line)) return true;
  return false;
}

function looksLikeName(line: string): boolean {
  if (isNoise(line)) return false;
  if (matchWard(line)) return false;
  const stripped = line.replace(TITLE_PATTERN, '').trim();
  // A member name is at least two words once titles are removed, e.g. "Tijs Broeke".
  return stripped.split(/\s+/).filter(Boolean).length >= 2;
}

function toRecord(rawName: string, ward?: string): MemberRecord {
  const role: MemberRole = /alderwoman/i.test(rawName)
    ? 'Alderwoman'
    : /alderman/i.test(rawName)
      ? 'Alderman'
      : 'Common Councillor';
  // Store the name as pasted; displayName() trims it down for the card.
  const name = rawName
    .replace(/^(mr\.?|mrs\.?|miss|ms\.?)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { name, ward, role };
}

/** Splits a row into cells on tabs, pipes, or runs of 2+ spaces. */
function cells(line: string): string[] {
  return line
    .split(/\t|\s*\|\s*|\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
}

export function parseRoster(text: string): MemberRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter(Boolean);

  const out: MemberRecord[] = [];
  const seen = new Set<string>();

  const push = (record: MemberRecord) => {
    const key = record.name.toLowerCase();
    if (!record.name || seen.has(key)) return;
    seen.add(key);
    out.push(record);
  };

  let pendingName: string | null = null;

  for (const line of lines) {
    const parts = cells(line);

    // Row form: cells on one line, one of which is a ward.
    if (parts.length > 1) {
      const wardCell = parts.find((c) => matchWard(c));
      const nameCell = parts.find((c) => looksLikeName(c));
      if (nameCell) {
        push(toRecord(nameCell, wardCell ? matchWard(wardCell)! : undefined));
        pendingName = null;
        continue;
      }
    }

    // Single value per line: remember names, attach the next ward we see.
    const ward = matchWard(line);
    if (ward) {
      if (pendingName) {
        push(toRecord(pendingName, ward));
        pendingName = null;
      }
      continue;
    }

    // "Name, Ward" on one line.
    const comma = line.lastIndexOf(',');
    if (comma > 0) {
      const tail = matchWard(line.slice(comma + 1));
      const head = line.slice(0, comma).trim();
      if (tail && looksLikeName(head)) {
        push(toRecord(head, tail));
        pendingName = null;
        continue;
      }
    }

    if (looksLikeName(line)) {
      // A name with no ward following it is still a usable card.
      if (pendingName) push(toRecord(pendingName));
      pendingName = line;
    }
  }

  if (pendingName) push(toRecord(pendingName));
  return out;
}

import type { Entity } from '../game/types';
import { ROSTER } from './roster';
import { matchWard } from './wards';

export type MemberRole = 'Alderman' | 'Common Councillor';

export interface MemberRecord {
  name: string;
  ward?: string;
  role?: MemberRole;
  /** Official portrait URL, filled in by the scraper. */
  photo?: string;
}

/**
 * The roster baked into the build. Ships as a partial, verified-only seed and is
 * replaced wholesale by `npm run scrape:members`. See src/data/roster.ts.
 *
 * A roster imported in the browser (localStorage) takes precedence over this.
 */
export const SEED_MEMBERS: MemberRecord[] = ROSTER;

const STORAGE_KEY = 'corpcodename:roster:v1';

export function loadRoster(): MemberRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_MEMBERS;
    const parsed = JSON.parse(raw) as MemberRecord[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_MEMBERS;
  } catch {
    return SEED_MEMBERS;
  }
}

export function saveRoster(records: MemberRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function clearRoster(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasImportedRoster(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function membersToEntities(records: MemberRecord[]): Entity[] {
  return records.map((m, i) => ({
    id: `member:${slug(m.name)}:${i}`,
    name: m.name,
    subtitle: [m.role, m.ward].filter(Boolean).join(' · ') || undefined,
    photo: m.photo,
  }));
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
  const role: MemberRole = /alder(man|woman)/i.test(rawName)
    ? 'Alderman'
    : 'Common Councillor';
  // Keep honorifics like Sir/Dame, drop the office and the Cllr/Mr noise.
  const name = rawName
    .replace(/\b(alderwoman|alderman|deputy|councillor|councilman|councilwoman|cllr\.?)\b\s*/gi, '')
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

/**
 * The 25 Wards of the City of London — the electoral divisions that each return
 * one Alderman and two or more Common Councillors to the Court of Common Council.
 *
 * Used to resolve the ward column when a roster is imported or scraped.
 */
export const WARD_NAMES = [
  'Aldersgate',
  'Aldgate',
  'Bassishaw',
  'Billingsgate',
  'Bishopsgate',
  'Bread Street',
  'Bridge and Bridge Without',
  'Broad Street',
  'Candlewick',
  'Castle Baynard',
  'Cheap',
  'Coleman Street',
  'Cordwainer',
  'Cornhill',
  'Cripplegate',
  'Dowgate',
  'Farringdon Within',
  'Farringdon Without',
  'Langbourn',
  'Lime Street',
  'Portsoken',
  'Queenhithe',
  'Tower',
  'Vintry',
  'Walbrook',
] as const;

export type WardName = (typeof WARD_NAMES)[number];

/** Lower-cased ward lookup used by the roster importer to spot ward columns. */
export const WARD_LOOKUP = new Map<string, string>(
  WARD_NAMES.map((name) => [name.toLowerCase(), name]),
);

// A few aliases the democracy portal and press releases use interchangeably.
WARD_LOOKUP.set('bridge', 'Bridge and Bridge Without');
WARD_LOOKUP.set('bridge without', 'Bridge and Bridge Without');
WARD_LOOKUP.set('bridge & bridge without', 'Bridge and Bridge Without');
WARD_LOOKUP.set('farringdon within ward', 'Farringdon Within');
WARD_LOOKUP.set('farringdon without ward', 'Farringdon Without');

/** Resolves free text like "Ward of Cheap" or "Cheap Ward" to a canonical name. */
export function matchWard(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^ward of\s+/, '')
    .replace(/\s+ward$/, '')
    .replace(/\s+/g, ' ');
  return WARD_LOOKUP.get(cleaned) ?? null;
}

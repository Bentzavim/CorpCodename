// -----------------------------------------------------------------------------
// Members of the City of London Corporation.
//
// This file is rewritten wholesale by `npm run scrape:members`, which reads the
// official member index. Hand edits are fine but will be overwritten on the next
// scrape.
//
// The list below is a partial, verified-only seed: the democracy portal was not
// reachable from the environment this project was scaffolded in, so unverified
// names for real officeholders were deliberately not invented. Run the scraper
// (or use the in-app "Import roster" panel) to get the full Court of Common
// Council — 25 Aldermen and 100 Common Councillors.
// -----------------------------------------------------------------------------
import type { MemberRecord } from './members';

export const ROSTER_SOURCE = 'https://democracy.cityoflondon.gov.uk/mgMemberIndex.aspx?bcr=1';

/** ISO timestamp of the last successful scrape, or null for the seed data. */
export const ROSTER_FETCHED_AT: string | null = null;

export const ROSTER: MemberRecord[] = [
  { name: 'Sir Charles Edward Beck Bowman', ward: 'Bassishaw', role: 'Alderman' },
  { name: 'Christopher Makin', ward: 'Aldersgate', role: 'Alderman' },
  { name: 'Robert Hughes-Penney', ward: 'Cheap', role: 'Alderman' },
  { name: 'Sir Alastair King', role: 'Alderman' },
  { name: 'Michael Mainelli', role: 'Alderman' },
  { name: 'Emma Edhem', role: 'Alderman' },
  { name: 'Tijs Broeke', ward: 'Cheap', role: 'Common Councillor' },
  { name: 'Simon Burrows', ward: 'Bishopsgate', role: 'Common Councillor' },
];

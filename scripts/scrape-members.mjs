#!/usr/bin/env node
/**
 * Pulls the current Members of the City of London Corporation from the official
 * ModernGov democracy portal and rewrites src/data/roster.ts.
 *
 * Usage:
 *   npm run scrape:members
 *   npm run scrape:members -- --no-photos     skip the per-member pages (faster)
 *   npm run scrape:members -- --out other.ts  write somewhere else
 *
 * Run this from a machine that can reach democracy.cityoflondon.gov.uk. It makes
 * ~125 polite, throttled GETs of public pages.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://democracy.cityoflondon.gov.uk';
const INDEX_URL = `${BASE}/mgMemberIndex.aspx?bcr=1`;
const SOURCE_URL = `${BASE}/mgMemberIndex.aspx?bcr=1`;
const USER_AGENT =
  'CorpCodename roster scraper (https://github.com/bentzavim/corpcodename) - one-off, throttled';

const WARDS = [
  'Aldersgate', 'Aldgate', 'Bassishaw', 'Billingsgate', 'Bishopsgate',
  'Bread Street', 'Bridge and Bridge Without', 'Broad Street', 'Candlewick',
  'Castle Baynard', 'Cheap', 'Coleman Street', 'Cordwainer', 'Cornhill',
  'Cripplegate', 'Dowgate', 'Farringdon Within', 'Farringdon Without',
  'Langbourn', 'Lime Street', 'Portsoken', 'Queenhithe', 'Tower', 'Vintry',
  'Walbrook',
];

const WARD_LOOKUP = new Map(WARDS.map((w) => [w.toLowerCase(), w]));
WARD_LOOKUP.set('bridge', 'Bridge and Bridge Without');
WARD_LOOKUP.set('bridge without', 'Bridge and Bridge Without');
WARD_LOOKUP.set('bridge & bridge without', 'Bridge and Bridge Without');

const args = process.argv.slice(2);
const withPhotos = !args.includes('--no-photos');
const outArg = args.indexOf('--out');
const OUT = resolve(ROOT, outArg >= 0 ? args[outArg + 1] : 'src/data/roster.ts');

// --- tiny HTML helpers -------------------------------------------------------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'",
};

function decode(value) {
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
      const key = code.toLowerCase();
      if (key in ENTITIES) return ENTITIES[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
      return match;
    })
    .replace(/ /g, ' ');
}

function stripTags(html) {
  return decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function matchWard(raw) {
  if (!raw) return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^ward of\s+/, '')
    .replace(/\s+ward$/, '')
    .replace(/\s+/g, ' ');
  return WARD_LOOKUP.get(cleaned);
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- scraping ----------------------------------------------------------------

/** Every member on the index page, as { uid, rawName }. */
function parseIndex(html) {
  const found = new Map();
  const anchor = /<a[^>]+href="[^"]*mgUserInfo\.aspx\?UID=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, uid, inner] of html.matchAll(anchor)) {
    const rawName = stripTags(inner);
    // Picture links wrap an <img> and strip to nothing — keep the text link.
    if (!rawName || found.has(uid)) continue;
    found.set(uid, rawName);
  }
  return [...found].map(([uid, rawName]) => ({ uid, rawName }));
}

/** Ward + portrait from an individual member page. */
function parseMemberPage(html) {
  let ward;

  // Preferred: the ward is a link back into the index filtered by ward id.
  for (const [, inner] of html.matchAll(
    /<a[^>]+href="[^"]*mgMemberIndex(?:Ward)?\.aspx\?[^"]*(?:WID|bcr)=[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const candidate = matchWard(stripTags(inner));
    if (candidate) {
      ward = candidate;
      break;
    }
  }

  // Fallback: a "Ward:" label somewhere in the page body.
  if (!ward) {
    const labelled = stripTags(html).match(/Ward[:\s]+([A-Za-z' &]+)/);
    if (labelled) ward = matchWard(labelled[1]);
  }

  // Last resort: any known ward name mentioned on the page.
  if (!ward) {
    const text = stripTags(html);
    ward = WARDS.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
  }

  const photoMatch = html.match(/<img[^>]+src="([^"]*(?:UserData|Images\/Members)[^"]*)"/i);
  const photo = photoMatch ? new URL(decode(photoMatch[1]), `${BASE}/`).href : undefined;

  return { ward, photo };
}

function toRecord(rawName, ward, photo) {
  const role = /alderwoman/i.test(rawName)
    ? 'Alderwoman'
    : /alderman/i.test(rawName)
      ? 'Alderman'
      : 'Common Councillor';
  // Keep the name as the index prints it — displayName() in src/data/members.ts
  // is the single place that trims a name down for a card.
  const name = rawName
    .replace(/^(mr\.?|mrs\.?|miss|ms\.?)\s+/i, '')
    .replace(/,\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { name, ward, role, photo };
}

/** Runs `worker` over `items` with a small pool, keeping input order. */
async function pooled(items, size, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
      await sleep(120); // be a considerate guest on a public sector site
    }
  });
  await Promise.all(runners);
  return results;
}

function serialise(records) {
  const lines = records.map((r) => {
    const fields = [`name: ${JSON.stringify(r.name)}`];
    if (r.ward) fields.push(`ward: ${JSON.stringify(r.ward)}`);
    if (r.role) fields.push(`role: ${JSON.stringify(r.role)}`);
    if (r.photo) fields.push(`photo: ${JSON.stringify(r.photo)}`);
    return `  { ${fields.join(', ')} },`;
  });

  return `// -----------------------------------------------------------------------------
// Members of the City of London Corporation.
//
// AUTO-GENERATED by scripts/scrape-members.mjs — do not edit by hand.
// Source: ${SOURCE_URL}
// -----------------------------------------------------------------------------
import type { MemberRecord } from './members';

export const ROSTER_SOURCE = ${JSON.stringify(SOURCE_URL)};

/** ISO timestamp of the last successful scrape. */
export const ROSTER_FETCHED_AT: string | null = ${JSON.stringify(new Date().toISOString())};

export const ROSTER: MemberRecord[] = [
${lines.join('\n')}
];
`;
}

async function main() {
  console.log(`Fetching member index …`);
  const index = parseIndex(await get(INDEX_URL));
  if (index.length === 0) {
    throw new Error(
      'No members found on the index page. The portal markup may have changed — ' +
        'check the mgUserInfo.aspx link pattern in parseIndex().',
    );
  }
  console.log(`  found ${index.length} members`);

  let records;
  if (withPhotos) {
    console.log(`Fetching individual member pages for ward and portrait …`);
    let done = 0;
    records = await pooled(index, 4, async ({ uid, rawName }) => {
      try {
        const { ward, photo } = parseMemberPage(await get(`${BASE}/mgUserInfo.aspx?UID=${uid}`));
        return toRecord(rawName, ward, photo);
      } catch (err) {
        console.warn(`  ! UID ${uid} (${rawName}): ${err.message}`);
        return toRecord(rawName);
      } finally {
        if (++done % 25 === 0) console.log(`  ${done}/${index.length}`);
      }
    });
  } else {
    records = index.map(({ rawName }) => toRecord(rawName));
  }

  // Sort by surname, which is what the index itself is ordered by.
  const surname = (n) => (n.split(/\s+/).pop() ?? n).toLowerCase();
  records.sort((a, b) => surname(a.name).localeCompare(surname(b.name))
    || a.name.localeCompare(b.name));
  await writeFile(OUT, serialise(records), 'utf8');

  const withWard = records.filter((r) => r.ward).length;
  const aldermen = records.filter((r) => r.role !== 'Common Councillor').length;
  console.log(
    `\nWrote ${records.length} members to ${OUT}` +
      `\n  ${aldermen} Aldermen and Alderwomen, ` +
      `${records.length - aldermen} Common Councillors` +
      `\n  ${withWard} with a ward, ${records.filter((r) => r.photo).length} with a portrait`,
  );
  if (records.length < 25) {
    console.warn('\n! Fewer than 25 members — a Codenames board needs 25 cards.');
  }
}

main().catch((err) => {
  console.error(`\nScrape failed: ${err.message}`);
  process.exitCode = 1;
});

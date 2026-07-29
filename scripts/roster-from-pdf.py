#!/usr/bin/env python3
"""Build src/data/roster.ts from a print-to-PDF of the Modern Council member index.

An alternative to scripts/scrape-members.mjs for when the democracy portal is
not reachable but someone can open it in a browser and print the page:

    https://democracy.cityoflondon.gov.uk/mgMemberIndex.aspx?bcr=1
    → Print → Save as PDF

    pip install pypdf
    python3 scripts/roster-from-pdf.py Your_Councillors.pdf

The page prints as a five-column grid of member cards. Vertical position runs
cumulatively across pages, so a card's lines stay contiguous within its column
even when the card straddles a page break — which is why records are keyed on
column + y rather than on reading order. Every record is anchored on the
mgUserInfo UID, with the ward matched against the 25 known ward names, so a
card's name and ward cannot drift apart.

Portraits are not in the printout; run the scraper if you want those.
"""
from collections import Counter
from datetime import date
from pathlib import Path
import argparse
import re
import sys

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit('pypdf is required: pip install pypdf')

WARDS = [
    "Aldersgate", "Aldgate", "Bassishaw", "Billingsgate", "Bishopsgate",
    "Bread Street", "Bridge and Bridge Without", "Broad Street", "Candlewick",
    "Castle Baynard", "Cheap", "Coleman Street", "Cordwainer", "Cornhill",
    "Cripplegate", "Dowgate", "Farringdon Within", "Farringdon Without",
    "Langbourn", "Lime Street", "Portsoken", "Queenhithe", "Tower", "Vintry",
    "Walbrook",
]
# Trailing labels the index prints under a card, which are not part of the ward.
LABELS = {"Alderman", "Alderwoman", "Alderman and", "Sheriff", "Labour",
          "Chief Commoner", "Independent"}

COL_BOUNDS = (130, 250, 370, 490)
COL_X = (5, 135, 255, 375, 495)
LINE_H = 18
BODY_TOP = 1600  # everything above this on page 1 is the introductory copy
CHROME = re.compile(r'democracy\.cityoflondon|Modern Council|^\d+/\d+/\d+|'
                    r'^\d+ Your Councillors|^\(mg(?!UserInfo)|^\(ie|^\(ec')
SOURCE_URL = 'https://democracy.cityoflondon.gov.uk/mgMemberIndex.aspx?bcr=1'


def column(x):
    """Column index for an x position, or None for the page footer."""
    if x > 700:
        return None
    for i, bound in enumerate(COL_BOUNDS):
        if x < bound:
            return i
    return 4


def page_runs(page):
    runs = []
    page.extract_text(
        visitor_text=lambda t, cm, tm, font, size:
            runs.append([tm[4], tm[5], t.strip()]) if t.strip() else None)
    return runs


def place_orphans(runs):
    """Give a position to runs that arrive with a degenerate (0, 0) text matrix.

    A handful of name lines follow an inline bullet image and lose their
    position. Content-stream order still runs left to right across a row, so the
    neighbours bracket the missing column: if they sit two or more columns apart
    the run owns a column between them, otherwise it is the opening line of the
    following neighbour's own card.
    """
    placed = [i for i, r in enumerate(runs)
              if (r[0] or r[1]) and column(r[0]) is not None]
    for i, run in enumerate(runs):
        if run[0] or run[1]:
            continue
        before = [j for j in placed if j < i]
        after = [j for j in placed if j > i]
        if not after:
            run[0], run[1] = 9999, 0  # trailing page chrome, filtered out later
            continue
        prev_col = column(runs[before[-1]][0]) if before else -1
        next_run = runs[after[0]]
        next_col = column(next_run[0])
        if next_col - prev_col >= 2:
            col, y = prev_col + 1, next_run[1]       # its own column, same row
        else:
            col, y = next_col, next_run[1] - LINE_H  # opens the next card
        run[0], run[1] = COL_X[col], y
    return runs


def read_lines(pdf_path):
    """Merge text runs into (column, y, text) lines, dropping page furniture."""
    cells = {}
    for page in PdfReader(pdf_path).pages:
        for x, y, text in place_orphans(page_runs(page)):
            col = column(x)
            if col is not None:
                cells.setdefault((col, round(y)), []).append((x, text))

    lines = []
    for (col, y), parts in cells.items():
        parts.sort()
        text = ' '.join(t for _, t in parts)
        if y < BODY_TOP or CHROME.search(text):
            continue
        lines.append((col, y, text))
    lines.sort()
    return lines


def join_name(parts):
    """Join a card's name lines, rejoining words wrapped on a hyphen."""
    name = ''
    for part in parts:
        if not name:
            name = part
        elif name.endswith('-'):
            name += part
        else:
            name += ' ' + part
    return name.strip()


def parse(lines):
    records = []
    for col in range(5):
        col_lines = [t for c, _, t in lines if c == col]
        i, buf = 0, []
        while i < len(col_lines):
            uid = re.match(r'^UID=(\d+)\)$', col_lines[i])
            if not uid:
                buf.append(col_lines[i])
                i += 1
                continue
            name = join_name([b for b in buf if b != '(mgUserInfo.aspx?'])
            buf = []
            i += 1
            ward = None
            for span in (2, 1):  # a long ward wraps onto a second line
                if ' '.join(col_lines[i:i + span]) in WARDS:
                    ward = ' '.join(col_lines[i:i + span])
                    i += span
                    break
            while i < len(col_lines) and col_lines[i] in LABELS:
                i += 1
            records.append({'uid': int(uid.group(1)), 'name': name, 'ward': ward})
    return records


def role(name):
    if 'Alderwoman' in name:
        return 'Alderwoman'
    return 'Alderman' if 'Alderman' in name else 'Common Councillor'


# Mirrors displayName() in src/data/members.ts. Only used for sorting here, so
# the roster comes out in the surname order a reader sees on the cards.
OFFICE = re.compile(r'\b(alderwoman|alderman|deputy|sheriff|chief\s+commoner|'
                    r'councillor|councilman|councilwoman|cllr\.?)\b', re.I)
POST_NOMINAL = re.compile(r'\b(KC|QC|MBE|OBE|CBE|DBE|KBE|GBE|BEM|JP|DL|TD|VR|VO'
                          r'|CVO|KCVO|DSO|MC)\b')
OFFICE_PREFIX = re.compile(r'^(the\s+rt\s+hon\.?\s+|the\s+right\s+honourable\s+|'
                           r'the\s+honourable\s+|the\s+lady\s+mayor,?\s+|'
                           r'the\s+lord\s+mayor,?\s+)+', re.I)


def display_name(raw):
    name = OFFICE_PREFIX.sub('', raw)
    name = re.sub(r'\([^)]*\)', ' ', name)
    name = POST_NOMINAL.sub(' ', name)
    name = OFFICE.sub(' ', name)
    name = re.sub(r'[,&]', ' ', name)
    return re.sub(r'\s{2,}', ' ', name).strip()


def sort_key(record):
    shown = display_name(record['name'])
    return (shown.split()[-1].lower(), shown.lower())


def check(records):
    """Hold the parse to what the index states about itself."""
    problems = []
    missing = [r for r in records if not r['ward'] or len(r['name']) < 6]
    if missing:
        problems.append(f'incomplete records: {missing}')
    if len({r['uid'] for r in records}) != len(records):
        problems.append('duplicate UIDs')

    aldermen = [r for r in records if role(r['name']) != 'Common Councillor']
    per_ward = Counter(r['ward'] for r in records)
    ald_per_ward = Counter(r['ward'] for r in aldermen)
    if len(per_ward) != 25:
        problems.append(f'{len(per_ward)} wards, expected 25')
    if unknown := set(per_ward) - set(WARDS):
        problems.append(f'unknown wards: {unknown}')
    # Each ward elects one Alderman and two or more Common Councillors.
    if odd := {w: n for w, n in ald_per_ward.items() if n != 1}:
        problems.append(f'wards without exactly one Alderman: {odd}')
    if len(ald_per_ward) != 25:
        problems.append(f'{len(ald_per_ward)} wards have an Alderman, expected 25')
    if thin := {w: n for w, n in per_ward.items() if n < 3}:
        problems.append(f'wards with fewer than 3 members: {thin}')
    return problems


def serialise(records):
    def quote(s):
        return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"

    rows = '\n'.join(
        f"  {{ name: {quote(r['name'])}, ward: {quote(r['ward'])}, "
        f"role: {quote(role(r['name']))} }},"
        for r in records)
    aldermen = sum(1 for r in records if role(r['name']) != 'Common Councillor')
    return f"""\
// -----------------------------------------------------------------------------
// The Court of Common Council of the City of London Corporation.
//
// {len(records)} Members: {aldermen} Aldermen and Alderwomen (one per Ward) and \
{len(records) - aldermen} Common
// Councillors, transcribed from the official member index — see ROSTER_SOURCE.
//
// Names are stored exactly as the index prints them, honours and office
// included; `displayName()` in ./members.ts trims them down for a card.
//
// AUTO-GENERATED by scripts/roster-from-pdf.py — do not edit by hand.
// -----------------------------------------------------------------------------
import type {{ MemberRecord }} from './members';

export const ROSTER_SOURCE = {quote(SOURCE_URL)};

/** When the roster was last taken from the source above. */
export const ROSTER_FETCHED_AT: string | null = '{date.today().isoformat()}';

export const ROSTER: MemberRecord[] = [
{rows}
];
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('pdf', help='print-to-PDF of the member index')
    ap.add_argument('-o', '--out', default='src/data/roster.ts')
    ap.add_argument('--force', action='store_true',
                    help='write even if the consistency checks fail')
    args = ap.parse_args()

    records = parse(read_lines(args.pdf))
    if not records:
        sys.exit('No members found — is this the member index page?')

    # Sort by surname, which is the order the index itself uses.
    records.sort(key=sort_key)

    problems = check(records)
    for p in problems:
        print(f'  ! {p}', file=sys.stderr)
    if problems and not args.force:
        sys.exit('\nRefusing to write a roster that fails its checks (--force to override).')

    Path(args.out).write_text(serialise(records), encoding='utf8')
    aldermen = sum(1 for r in records if role(r['name']) != 'Common Councillor')
    print(f'Wrote {len(records)} members to {args.out}\n'
          f'  {aldermen} Aldermen and Alderwomen, '
          f'{len(records) - aldermen} Common Councillors\n'
          f'  {len(set(r["ward"] for r in records))} wards')


if __name__ == '__main__':
    main()

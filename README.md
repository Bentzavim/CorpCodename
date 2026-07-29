# Corp Codenames

Codenames played with the Members of the City of London Corporation — the
Aldermen and Common Councillors of the Court of Common Council.

Two teams, a 5×5 board, one spymaster each. The spymaster sees the key card and
gives a one-word clue with a number; their team turns over cards until they get
one wrong, run out of guesses, or hit the assassin and lose on the spot.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

It is a static single-page app with no backend. Deploying to Vercel needs no
configuration — the Vite preset builds `dist/` and serves it.

## Turn by turn

The game walks through turns rather than leaving the board open:

1. The spymaster gives a one-word clue and a number. Nothing can be turned over
   before that.
2. Their team gets that many guesses plus one. The counter is live.
3. A correct card lets them carry on; a bystander, the other team's card, or
   running out of guesses ends the turn. The assassin ends the game.
4. A **handoff screen** covers the board between turns. The key card is hidden
   and the spymaster toggle is locked until the incoming spymaster confirms, so
   a shared screen cannot leak the previous team's view.

**Spymaster view** tints every card with its true colour. It is per device and
is forced off at every handoff and every new board.

## The Members roster

`src/data/roster.ts` holds the full Court of Common Council — **125 Members: 25
Aldermen and Alderwomen, one per Ward, and 100 Common Councillors** — transcribed
from the official
[member index](https://democracy.cityoflondon.gov.uk/mgMemberIndex.aspx?bcr=1).
Each game deals 25 of them, so boards stay varied. Nothing needs importing.

Names are stored exactly as the index prints them —
`Sir Alastair John Naisbitt King DL (Alderman)` — and `displayName()` in
`src/data/members.ts` is the single place that cuts one down to what a card
shows: **an optional title, a first name and a surname**, so
`Sir Alastair King`. Middle names, offices, wards and post-nominals are all
dropped, and the only titles kept are Sir, Dame and Hon. Nothing else appears on
a card. All 125 stay distinct once shortened, which `displayName` is checked
against — if a future roster ever collides, that check is where it will show up.

### Refreshing it

Either ingester rewrites `roster.ts` wholesale.

```bash
npm run scrape:members                  # names, wards and portraits
npm run scrape:members -- --no-photos   # names only, one request
```

Run the scraper from a machine that can reach the portal; it makes ~125
throttled GETs of public pages.

```bash
pip install pypdf
python3 scripts/roster-from-pdf.py Your_Councillors.pdf
```

The second path is for when the portal is blocked but someone can open it in a
browser and print the page to PDF — which is how the current roster was built.
The printout is a five-column card grid, so the parser keys records on column
and vertical position rather than reading order, anchors each on its member UID,
and matches wards against the 25 known names. It then refuses to write unless
the result matches what the index states about itself: 125 Members, 25 wards,
exactly one Alderman per ward, and at least two Common Councillors alongside.
No portraits — those only exist on the member pages.

### Importing a different roster

*Import roster* takes text pasted straight off the portal and overrides the
built-in list for that browser. The parser anchors on the 25 ward names, so it
copes with the table view, the list view, and `Name, Ward` lines. The result is
kept in `localStorage`; *Reset to built-in* clears it.

## Sharing a game

Every board is derived from a short seed shown in the header, and the seed lives
in the URL (`#seed=K7QM2P`). **Share** copies that link. Anyone who opens it gets
the identical board and key card, which is what lets two spymasters run a game
from different rooms. **New game** rolls a fresh seed.

The board is dealt from the roster, so a shared seed only reproduces for someone
running the same roster. That is the default; it only diverges if one side has
imported their own list.

## Layout

```
src/
  game/        rules engine — seeded RNG, board generation, turn logic (no React)
  data/        the member roster, the roster parser, the 25 ward names
  components/  board, cards, scoreboard, clue bar, handoff, log, importer
scripts/
  scrape-members.mjs    roster from the live portal
  roster-from-pdf.py    roster from a print-to-PDF of the same page
```

`src/game/` is pure and side-effect free: `createGame`, `giveClue`,
`revealCard`, and `pass` all take a state and return a new one, so the rules can
be exercised without a browser.

## Attribution

Member names, wards and portraits belong to the City of London Corporation and
are used here for a game. This project is not affiliated with or endorsed by the
Corporation. Codenames is a game by Vlaada Chvátil, published by Czech Games
Edition; this is an unofficial implementation of the mechanics with a different
card set.

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
npm run dev:api    # the /api handlers, for online play (separate terminal)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

`dev:api` runs the very same handlers Vercel runs from `api/`, on a plain Node
server that Vite proxies to. Pass-and-play needs no server at all — only online
rooms do.

## Deploying

Live at **https://corp-codename.vercel.app**, built from this repo's default
branch on every push.

Vercel needs no setup beyond importing the repo: its Vite preset already runs
`npm run build` and serves `dist/`, and the two files in `api/` become functions
on their own. The seed and the room code live in the URL *hash*, so no SPA
rewrite rule is needed — a shared link never reaches the server as a path.

Online rooms want one environment variable pair; see
[Rooms need somewhere to live](#rooms-need-somewhere-to-live).

`vercel.json` exists only to cache the portraits. They live in `public/members/`
under stable, unhashed filenames, so without it every card image revalidates on
each load; with it they come from disk cache for a day and refresh in the
background after that.

Anywhere else that serves static files will do for pass-and-play, which needs no
backend at all; online rooms need somewhere to run `api/`. Hosting under a
sub-path, as GitHub Pages does, additionally needs `base: '/CorpCodename/'` in
`vite.config.ts` — portrait URLs already resolve against
`import.meta.env.BASE_URL`, so they follow automatically.

## Turn by turn

The game walks through turns rather than leaving the board open:

1. The spymaster gives a clue and a number. It has to be **one word** — the form
   will not submit two. Nothing can be turned over before a clue is in.
2. Their team gets that many guesses plus one, counted down live.
3. **Zero and ∞ lift the cap.** Saying zero ("none of my cards relate to this")
   or pressing ∞ ("go after what's left from earlier clues") lets the team keep
   guessing until they get one wrong or stop, as the rules have it.
4. A correct card lets them carry on; a bystander, the other team's card, or
   running out of guesses ends the turn. The assassin ends the game. The other
   team's card is credited to that team, so a bad guess can lose you the game.
5. A **handoff screen** covers the board between turns. The key card is hidden
   and the spymaster toggle is locked until the incoming spymaster confirms, so
   a shared screen cannot leak the previous team's view.

**Spymaster view** tints every card with its true colour. It is per device and
is forced off at every handoff and every new board.

## Playing online

**Play online** opens a room with a four-letter code. Share the link, everyone
picks a bench and a seat, and the host deals.

Each player gets their own screen showing only what their seat is entitled to:

- **Spymasters** see the key card — both of them see the same one, as in the box.
- **Operatives** see colours only on cards already turned over. The rest of the
  key card is not hidden in their browser, it is never sent to it.
- Only the spymaster on turn can give a clue; only that team's operatives can
  turn cards over. A spymaster cannot touch the board at all.

Reload, close the tab, or lose signal and you come back to the same seat — the
room is in the URL and your identity is in `localStorage`.

### How it holds up

Pass-and-play could keep the whole board in the browser because the key card was
on the table anyway. Online it cannot: the seed alone reproduces the entire key
card, so it stays on the server and is never serialised to anyone. `publicRoom()`
in `src/room/view.ts` is the only way state reaches a client, and it builds each
card field by field rather than trimming a copy of the real one — a spread plus a
`delete` is one careless edit from putting the key card on the wire.

The engine knew only about turns; over a network "may *this* player do this?" is
a separate question, asked in one place in `src/room/actions.ts`.

### Transport

Actions go up as ordinary `POST`s to `/api/room`; state comes back down a
Server-Sent Events stream from `/api/stream`. SSE needs no protocol upgrade, so
it runs on an ordinary serverless function, and `EventSource` reconnects by
itself when the platform closes a long request — which it will, so the stream
closes itself at 50s and the client resumes from its last version.

### Rooms need somewhere to live

A serverless function forgets everything between requests, so rooms need a store.

Without one the app falls back to **in-memory**, which works locally and for a
single instance, but breaks as soon as the platform runs a second one: two
players get two different rooms, or a room seems to vanish. Fine for `npm run
dev`; **not fine in production**.

To fix it, add a Redis store from the Vercel dashboard — Marketplace → any Redis
provider → connect to the project. That sets `KV_REST_API_URL` and
`KV_REST_API_TOKEN`, which is all the code looks for. Redeploy and it switches
over on its own. `POST /api/room {"op":"health"}` reports which is in use.

Rooms expire 12 hours after their last request either way.

## The Members roster

`src/data/roster.ts` holds the full Court of Common Council — **125 Members: 25
Aldermen and Alderwomen, one per Ward, and 100 Common Councillors** — transcribed
from the official
[member index](https://democracy.cityoflondon.gov.uk/mgMemberIndex.aspx?bcr=1),
each with their official portrait in `public/members/` (125 files, ~640 KiB).
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
and matches wards against the 25 known names.

Portraits are embedded in the printout and come out with it. They are placed
through the graphics matrix rather than the text matrix — a different scale,
with y running the other way — so they are matched by their order down each
page-column: the nth portrait belongs to the nth card. A column whose portrait
and member counts disagree is reported rather than guessed at, because one
missing picture would shift every pairing below it.

The script refuses to write at all unless the result matches what the index
states about itself: 125 Members, 25 wards, exactly one Alderman per ward, at
least two Common Councillors alongside, and a portrait for everyone.

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
  room/        online play: what a client may see, and who may act
  online/      lobby, join screen, the room connection
  data/        the member roster, the roster parser, the 25 ward names
  components/  board, cards, scoreboard, clue bar, handoff, log, importer
server/        the room store (memory or Redis) — server-only, never bundled
api/           Vercel functions: /api/room and /api/stream
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

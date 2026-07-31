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

Online rooms additionally need a Redis; see
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

## Two benches, or one

**Benches** in the header (and in the online lobby) picks the shape of the game.

**Red v Blue** is the usual thing: 25 cards split 9 / 8 / 7 bystanders / 1
assassin, two spymasters, first bench to find all their own Members wins.

**Violet, alone** is one bench against the clock. The Violet Bench — violet
being an Aldermanic gown colour — gets the same **nine** Members the opening
bench gets head to head. There is no opposition to hand a card to, so every
other card but the assassin is a **bystander, and every bystander ends the
turn**. The bench has **nine turns**; a bystander, a spent set of guesses or an
ended turn each cost one. Find all nine and you win; run out of turns, or turn
over the assassin, and you lose. Nobody wins in your place.

Two things there were choices rather than requirements, and both are one
constant each in `src/game/types.ts`:

- **`SOLO_TURNS = 9`.** Without a clock the assassin would be the only way to
  lose, and a patient player would always win eventually. Nine matches the nine
  cards; raise it to make the game gentler.
- **`SOLO_TEAM_CARDS = FIRST_TEAM_CARDS`** — nine, the opening bench's share
  rather than the second's eight.

## Turn by turn

The game walks through turns rather than leaving the board open:

Both shapes share the same turn:

1. The spymaster gives a clue and a number. It has to be **one word** — the form
   will not submit two. Nothing can be turned over before a clue is in.
2. Their team gets that many guesses plus one, counted down live.
3. **Zero and ∞ lift the cap.** Saying zero ("none of my cards relate to this")
   or pressing ∞ ("go after what's left from earlier clues") lets the team keep
   guessing until they get one wrong or stop, as the rules have it.
4. A correct card lets them carry on; a bystander, the other bench's card, or
   running out of guesses ends the turn. The assassin ends the game. Head to
   head the other bench's card is credited to them, so a bad guess can lose you
   the game; solo, an ended turn costs one off the clock.
5. A **handoff screen** covers the board between turns. The key card is hidden
   and the spymaster toggle is locked until the incoming spymaster confirms, so
   a shared screen cannot leak the previous team's view.

**Spymaster view** tints every card with its true colour. It is per device and
is forced off at every handoff and every new board.

## Playing online

**Play online** opens a room with a four-letter code. Share the link, everyone
picks a seat, and the host deals. The host also chooses whether it is Red v Blue
or Violet alone; changing it empties the seats, since the benches on offer
change with it.

Each player gets their own screen showing only what their seat is entitled to:

- **Spymasters** see the key card — both of them see the same one, as in the box.
  Solo there is just the one.
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
closes itself at 25s and the client resumes from its last version.

### Rooms need somewhere to live

A serverless function forgets everything between requests, so rooms need a store.

Without one the app falls back to **in-memory**, which works locally and for a
single instance, but breaks as soon as the platform runs a second one: two
players get two different rooms, or a room seems to vanish. Fine for `npm run
dev`; **not fine in production**.

**To fix it:** Vercel dashboard → **Storage** → add a Redis → connect it to this
project → redeploy. Nothing to configure: the integration sets the variables and
the store switches over on its own.

Either dialect works, and which one you get depends on the provider:

- a **`redis://` connection string** (`REDIS_URL`, `KV_URL`) — preferred, because
  it brings real pub/sub, so a move reaches the other players the instant it
  lands;
- **Upstash's HTTP API** (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) — no
  persistent connection, but no subscriptions either, so each player polls their
  own room instead.

`GET /api/room` in a browser reports what the deployment can actually see, which
is the quickest way to tell a missing integration from a half-connected one:

```json
{ "ok": true, "store": "redis", "transport": "tcp", "found": ["REDIS_URL"] }
```

Variable *names* only — never values, since a connection string carries a
password. When it still says `memory` it says why: half a REST pair, or a value
that is not a `redis://` URL.

On the REST transport each player polls their own room — briskly for a few
seconds after something happens, then easing off to 2.5s while the table thinks,
because a flat fast poll would spend a free tier's daily allowance on a single
sitting. On TCP there is no polling at all: a game costs about a hundred
commands regardless of how long anyone spends thinking.

Rooms expire 12 hours after their last request, in either store.

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

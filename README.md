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

## The Members roster

**The deck that ships in this repo is incomplete: 8 names, not 125.**

The full membership — 25 Aldermen and 100 Common Councillors — is published at
[democracy.cityoflondon.gov.uk](https://democracy.cityoflondon.gov.uk/mgMemberIndex.aspx?bcr=1).
That site was not reachable from the sandbox this project was built in, and
inventing plausible-looking names for real officeholders is worse than shipping
a short list, so `src/data/roster.ts` contains only members that could actually
be verified. Until it is filled in, the app opens on the **Wards** deck instead.

Two ways to complete it:

**1. Paste it in** (no tooling, stays in your browser)

Open the member index, select the list, copy it, and use *Import roster* in the
app. The parser anchors on the 25 ward names, so it copes with the table view,
the list view, and `Name, Ward` lines. The result is kept in `localStorage`;
*Reset to built-in* clears it.

**2. Bake it in** (goes into the repo)

```bash
npm run scrape:members              # fetches names, wards and portraits
npm run scrape:members -- --no-photos   # names only, one request
```

This rewrites `src/data/roster.ts`. Run it from a machine that can reach the
portal; it makes ~125 throttled GETs of public pages. Commit the result and the
Members deck becomes the default.

## Decks

| Deck | Cards | Notes |
| --- | --- | --- |
| Members | roster size | Aldermen and Common Councillors. Needs ≥25 to play. |
| Wards | 25 | The 25 Wards of the City. Always playable. |

A deck is just a list of `{ id, name, subtitle?, photo? }` — see
`src/data/decks.ts` to add another.

## Sharing a game

Every board is derived from a short seed shown in the header, and the seed lives
in the URL (`#deck=members&seed=K7QM2P`). **Share** copies that link. Anyone who
opens it gets the identical board and key card, which is what lets two
spymasters run a game from different rooms. **New game** rolls a fresh seed.

Note that the Members deck also depends on the roster: two players sharing a
seed need the same roster, so either both import the same paste or both use a
scraped build.

## Spymaster view

The *Spymaster view* toggle tints every card with its true colour. It is per
device and resets whenever a new board is dealt, so it will not leak a key card
into the next game — but do turn it off before handing the screen over.

## Layout

```
src/
  game/        rules engine — seeded RNG, board generation, turn logic (no React)
  data/        decks: the 25 wards, the member roster, the roster parser
  components/  board, cards, scoreboard, clue bar, log, roster importer
scripts/
  scrape-members.mjs
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

# Scope: online play

A room each player joins from their own device, picking a team and whether they
are spymaster or operative, with the board showing only what their role is
allowed to see.

Status: **not built**. This is a scope, not a design sign-off — the open
questions at the end need answering before any of it starts.

## The actual problem

The visible feature is a lobby. The work is somewhere else.

Right now every device computes the whole board itself:

```ts
// src/game/engine.ts
const rng = createRng(`${deckId}:${seed}`);
const kinds = buildKinds(startingTeam, rng);
cards: picked.map((entity, i) => ({ entity, kind: kinds[i], revealed: false }))
```

The seed is in the URL, the roster ships in the bundle, and `createGame` is
deterministic. **Anyone can derive the key card** — paste the seed into the
console, or just read `game.cards` off the React tree. Spymaster view is a CSS
class, not a secret.

For pass-and-play that is fine: one screen, one honour system, and the handoff
screen is there to stop accidental glimpses rather than deliberate ones. The
moment players are on separate devices it is fatal, and no amount of lobby UI
fixes it.

So the feature is: **move authority off the client.** The server holds the key
card and sends each player only what their role may see. The lobby is the part
you can see; the redaction is the part that matters.

A consequence worth stating early: the room code and the board seed have to
become different things. The room code is public — people read it aloud. The
board seed becomes a server-side secret that is never sent to anyone. Today
they are the same string.

## What survives

Most of it. The engine is already `(state, action) => state` with no I/O, which
is exactly what a server wants to run:

| Stays as-is | Why |
| --- | --- |
| `src/game/engine.ts` | Pure. Runs server-side unchanged. |
| `src/game/rng.ts` | Still generates boards, now from a secret seed. |
| `src/data/` + `public/members/` | Clients already have all 125 portraits bundled. |
| `Board`, `Card`, `Avatar`, `Scoreboard`, `GameLog` | Render whatever state they are handed. |
| Local pass-and-play | Kept as a mode. See "the artifact" below. |

The portraits being bundled is a real win: the server never sends images, only
the 25 entity **ids** for a board. Room payloads stay in the low kilobytes.

## What has to be built

### 1. A redacted view of the game

The one new idea in the whole feature.

```ts
type PublicCard = {
  entity: Entity;
  revealed: boolean;
  kind: CardKind | null;   // null unless revealed, or unless you are a spymaster
};
```

The server keeps the full `GameState` and projects it per socket by role. An
operative's socket must never receive an unrevealed `kind` — not hidden in a
field they don't render, not present-but-ignored. If it reaches the browser it
is public.

This is the piece to write first and test hardest: given a state and a role,
assert the serialised payload contains no unrevealed kinds. That test is worth
more than the rest of the suite.

### 2. Authorisation

The engine checks *whether* a move is legal for the current turn. It does not
check *who* is making it, because until now there was only one player. Needs a
thin layer above the engine:

- only the current team's spymaster may `giveClue`
- only the current team's operatives may `reveal` or `pass`
- only the host may `startGame` / `newGame` / change another player's team
- a spymaster who tries to reveal a card is rejected, not merely hidden from

Small — maybe 60 lines — but it is the second half of the trust boundary and
belongs next to the redaction, not scattered through handlers.

### 3. Rooms and presence

```ts
type Room = {
  code: string;              // public, spoken aloud
  seed: string;              // secret, never serialised to a client
  hostId: PlayerId;
  players: Player[];
  game: GameState | null;    // null while still in the lobby
};

type Player = {
  id: PlayerId;              // persisted in localStorage for reconnect
  name: string;
  team: Team | null;
  role: 'spymaster' | 'operative' | null;
  connected: boolean;
};
```

Reconnect matters more than it sounds: phones sleep, tabs get backgrounded, and
a spymaster dropping mid-turn should not end the game. Player id in
`localStorage`, rejoin by id, seat restored.

### 4. Lobby UI

New screens: create/join by code, the roster of who is in which seat, team and
role pickers with "one spymaster per team" enforced, a start button for the
host. Then in-game: who is connected, whose turn, a disconnect notice.

### 5. Transport

The requirement is not "WebSockets". It is two things:

- **push**, so a guess appears on five screens at once rather than up to a poll
  interval later;
- **state that outlives a request**, because a serverless function forgets
  everything between invocations and a room has to persist across all of them.

Those are separable, and conflating them is what makes this look like it needs a
particular host. It does not.

| | Push | Room state | Notes |
| --- | --- | --- | --- |
| **A. Vercel + SSE + Redis** *(recommended)* | `EventSource` stream per player | Upstash/Vercel KV, pub/sub to fan out | Stays on Vercel |
| **B. Vercel + managed realtime** | Ably / Pusher / Supabase Realtime | same | Fewer moving parts, another vendor |
| **C. Cloudflare Durable Objects** | WebSocket, built in | the object itself | Tidiest, but moves hosts |
| **D. Host-authoritative P2P** | WebRTC | host's browser | Reject — see below |

**A is the recommendation, and it stays on Vercel.** Actions go client→server as
ordinary `POST`s; state changes come back server→client on a Server-Sent Events
stream. SSE is one-way, which is exactly the shape here — a turn-based game with
bursty, low-volume traffic and a clear request/broadcast split. It needs no
protocol upgrade, so nothing about Vercel's function model is in the way, and
`EventSource` reconnects on its own.

Two things to verify against current Vercel limits before building, because both
have moved and neither is worth guessing at:

- **Function max duration.** An SSE stream is one long-lived invocation, so it
  will be cut at the platform ceiling and have to reconnect. Fine — `EventSource`
  does that automatically and the client re-syncs from a state version number —
  but pick the heartbeat and resume logic to match the real ceiling.
- **Fan-out across instances.** Two players may be served by different
  instances, so a broadcast cannot be an in-memory loop. Redis pub/sub carries
  it. This is the reason the room state store is not optional.

**B** trades a dependency for a vendor: the realtime service handles fan-out,
reconnect and presence, and presence is fiddly enough by hand that this is a
fair trade if the free tier fits.

**C** remains the tidiest architecture — one object per room holds both the
state and the sockets, so there is no separate store and no fan-out problem at
all. It is not worth changing hosts for on its own; it is the answer only if
Cloudflare is wanted for other reasons.

**D** should be rejected on correctness, not taste: the host's browser holds the
key card, so the host can read it. It also still needs a signalling server, so it
does not even avoid the server it appears to avoid.

## The artifact stays local-only

Worth knowing before this starts: **the shareable artifact cannot do online
play.** Its CSP blocks WebSockets and fetch to any external host — that is the
same restriction that made every portrait an inlined data URI. Online play needs
a real deployment.

That is an argument for keeping pass-and-play rather than replacing it: it is
the mode that works with no server, in the artifact, and on a plane. The handoff
screen keeps earning its place there.

## Order of work

Each phase is shippable on its own.

1. **Redaction + authorisation, entirely local.** No server yet. Build
   `publicView(state, role)` and the authorisation layer, test them hard against
   the existing engine. Nothing user-visible; everything downstream depends on
   being sure this is right.
2. **Server, one room, no lobby.** Hard-coded seats, real WebSocket, two browsers
   playing a game end to end. Proves the transport and the redaction together.
3. **Lobby.** Create/join, seat picking, host controls, start.
4. **Reconnect and presence.** Drop, rejoin, seat restored, disconnect notices.
5. **Polish.** Spectators, "new game, same teams", rejoining a finished game.

Phase 1 is the one to get right and the one that is cheapest to get right,
because it needs no infrastructure at all.

## Rough size

Against ~1,300 lines of existing source:

| Phase | New code | Notes |
| --- | --- | --- |
| 1 Redaction + auth | ~150 lines + tests | Pure functions, heavily tested |
| 2 Server + transport | ~300 lines | Route handlers, SSE stream, Redis pub/sub |
| 3 Lobby UI | ~350 lines | 3–4 components, plus client connection state |
| 4 Reconnect | ~120 lines | Both ends, plus stream resume |
| 5 Polish | ~150 lines | |

Call it 1,000 lines and a doubling of the app's surface area — the first
substantial thing this project has needed a backend for, so budget for the
deployment story, not just the code.

## Open questions

These change the shape of the work and need answering first.

1. **Realtime by hand, or bought in?** Transport A (SSE + Redis pub/sub) keeps
   everything in one repo with no extra vendor; B hands fan-out, reconnect and
   presence to Ably or similar. Presence is the fiddliest part of doing it by
   hand, so this is a fair place to spend a dependency. Both stay on Vercel.
2. **Custom rosters in online rooms?** Everyone has the built-in 125 bundled, so
   the server sends ids only. A host with an imported roster breaks that — either
   the room uploads the roster, or imports stay a local-play feature.
3. **Do rooms persist?** In-memory dies on redeploy; persisted survives but needs
   an eviction policy. In-memory is fine for a game people play in one sitting.
4. **Is there any moderation surface?** A public room code means strangers can
   join and see real officeholders' names against team colours. Probably wants
   rooms to be unlisted-by-default and short-lived, which they already would be.
